const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const csv = require('csv-parser');
const multer = require('multer');
const { Server } = require('ws');
const { type } = require('os');

const app = express();
const port = 5000;
const storeHash = '2y1g1tdlub';
const authToken = 'jr9wifrgu40h0kpz0xw03s3bgo8efrt';
const uploadFolder = path.join(__dirname, 'bc-exports');
const expiredCustomersFolder = path.join(__dirname, 'expired-customers');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadFolder);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// If the uploadFolder or expiredCustomersFolder don't exist, create them for new files
if (!fs.existsSync(uploadFolder)) fs.mkdir(uploadFolder);
if (!fs.existsSync(expiredCustomersFolder)) fs.mkdir(expiredCustomersFolder);

let fetch;
(async () => {
    const module = await import('node-fetch');
    fetch = module.default;
})();

async function getExpirationDate(customerID) {
    // Wait until fetch is available
    while (!fetch) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (customerID) {
        const URL = `https://api.bigcommerce.com/stores/${storeHash}/v3/customers/attribute-values?customer_id:in=${customerID}`;
        const GETOptions = {
            method: 'GET',
            headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Auth-Token": authToken
            },
            redirect: 'follow'
        }

        try {
            const response = await fetch(URL, GETOptions);
            const data = await response.json();
            const attribute = data.data.find(attr => attr.attribute_id == 2);
            return attribute ? attribute.attribute_value : null;
        } catch(err) {
            console.log("Error: ", err);
            return null;
        }
    }
}

// Create WebSocket Server to track progress
const wss = new Server({ noServer: true });
let wsConnection;

wss.on('connection', ws => {
    wsConnection = ws;
    ws.on('message', message => {
        console.log('Received: %s', message);
    })
    ws.on('close', () => {
        wsConnection = null;
    });
});

app.post('/upload', upload.single('file'), (req, res) => {
    const file = req.file;

    console.log('File uploaded:', file);

    if (!file) return res.status(400).send('No file uploaded.');

    const filePath = file.path;
    const customers = [];

    fs.createReadStream(filePath)
        .pipe(csv({
            mapHeaders: ({ header }) => header.trim(), // Trim headers to remove any leading/trailing spaces
            quote: '"' // Specify quote character for CSV parser (default is double quote)
        }))
        .on('data', row => {
            customers.push(row);
        })
        .on('end', async () => {
            console.log('CSV file read complete. Processing data...');

            // Filter the customers based on the specified customer groups
            const filteredGroups = ["gold service club", "gold service club - h2o", "platinum service club", "platinum service club - h2o"];
            const filteredCustomers = customers.filter(customer => filteredGroups.includes(customer['Customer Group'].toLowerCase()));

            // Check if there are any filtered customers
            if (filteredCustomers.length === 0) return res.status(400).send('No customers found matching the specified groups.');

            // Transform the filtered customers
            const transformedCustomers = [];
            const totalCustomers = filteredCustomers.length;
            let processedCustomers = 0;

            for (const customer of filteredCustomers) {
                // Check if there are more than 5 fields (handle quoted fields with commas)
                if (Object.keys(customer).length > 5) {
                    // Combine extra fields into the correct field (e.g., Customer Name)
                    const extraFields = Object.keys(customer).slice(5); // Get all extra fields
                    const combinedCustomerName = extraFields.map(key => customer[key]).join(',');
                    customer['Customer Name'] = combinedCustomerName;
                    
                    // Remove the extra fields
                    extraFields.forEach(field => delete customer[field]);
                }

                // Get customer's expiration date from BC Attribute Values API
                const expirationDate = await getExpirationDate(customer['Customer ID']);

                // Remove Date Joined and add Expiration Date
                delete customer['Date Joined'];
                customer['Expiration Date'] = expirationDate || 'N/A'; // Use 'N/A' if no expiration date exists

                transformedCustomers.push(customer);
                processedCustomers++;

                // Send progress update to front end
                if (wsConnection && wsConnection.readyState === wsConnection.OPEN) {
                    wsConnection.send(JSON.stringify({
                        type: 'progress',
                        progress: (processedCustomers / totalCustomers) * 100
                    }));
                }
            }

            if (transformedCustomers.length === 0) return res.status(400).send('No transformed customers to write to CSV.');

            // Generate timestamp for the file name
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-T${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

            // Prepare CSV header
            const csvHeader = Object.keys(transformedCustomers[0]).join(',') + '\n';
        
            // Prepare CSV rows
            const csvRows = transformedCustomers.map(customer => Object.values(customer).map(value => {
                // Enclose values in double quotes if they contain commas
                if (value.includes(',')) {
                    return `"${value}"`;
                }

                return value;
            }).join(',') + '\n');

            // Write to CSV file with timestamped file name
            const csvFileName = `expired-customers-${timestamp}.csv`;
            // const csvFilePathOutput = `${expiredCustomersFolder}/${csvFileName}`;
            const csvFilePathOutput = path.join(expiredCustomersFolder, csvFileName);
            
            fs.writeFile(csvFilePathOutput, csvHeader + csvRows.join(''), { encoding: 'utf8' }, (err) => {
                if (err) return res.status(500).send('Error writing CSV file.');

                // Delete orignal CSV if expired customers CSV is created
                fs.unlink(filePath, err => {
                    if (err) return res.status(500).send('Error deleting original CSV file.');

                    res.json({ 
                        message: `CSV file with expired customers created: ${csvFileName}`,
                        downloadUrl: `http://localhost:5000/download/${csvFileName}`
                    });
                });
            });
        });
});

app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(expiredCustomersFolder, filename);

    res.download(filePath);
})

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    })
})