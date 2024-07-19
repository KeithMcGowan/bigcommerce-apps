require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const csv = require('csv-parser');
const multer = require('multer');
const { Server } = require('ws');
const { Readable } = require('stream');

const app = express();
const port = process.env.PORT || 5000;
// const storeHash = '2y1g1tdlub';
const storeHash = process.env.STORE_HASH;
// const authToken = 'jr9wifrgu40h0kpz0xw03s3bgo8efrt';
const authToken = process.env.AUTH_TOKEN;

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    exposedHeaders: ['Content-Disposition'] // Ensure header is exposed
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client', 'build')));

// Multer setup for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

    const customers = [];

    Readable.from(file.buffer.toString())
        .pipe(csv({
            mapHeaders: ({ header }) => header.trim(), // Trim headers to remove any leading/trailing spaces
            quote: '"' // Specify quote character for CSV parser (default is double quote)
        }))
        .on('data', row => {
            customers.push(row);
        })
        .on('end', async () => {
            console.log('CSV file read complete. Processing data...');

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
                    const extraFields = Object.keys(customer).slice(5);
                    const combinedCustomerName = extraFields.map(key => customer[key]).join(',');

                    customer['Customer Name'] = combinedCustomerName;
                    
                    // Remove the extra fields
                    extraFields.forEach(field => delete customer[field]);
                }

                const expirationDate = await getExpirationDate(customer['Customer ID']);

                // Remove Date Joined and add Expiration Date
                delete customer['Date Joined'];
                customer['Expiration Date'] = expirationDate || 'N/A';

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
                if (value.includes(',')) {
                    return `"${value}"`;
                }
                return value;
            }).join(',') + '\n');

            // Write to CSV file with timestamped file name
            const csvContent = csvHeader + csvRows.join('');
            const fileName = `expired-customers-${timestamp}.csv`;

            res.setHeader('Content-disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', 'text/csv');

            // Log headers to verify
            console.log('Response Headers:', res.getHeaders());

            res.status(200).send(csvContent);
        });
});

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'client', 'build', 'index.html'));
})

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Allow front end to listen to server to send progress updates
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    })
})