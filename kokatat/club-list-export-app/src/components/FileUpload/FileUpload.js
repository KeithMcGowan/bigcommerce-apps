import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from 'react-modal';
import styles from "./FileUpload.module.scss";

// Set app element for accessibility
Modal.setAppElement('#root');

const FileUpload = () => {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState('');
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState('');
    // const [alert, setAlert] = useState(null);

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:5000');

        ws.onmessage = e => {
            const data = JSON.parse(e.data);
            
            if (data.type === 'progress') {
                setProgress(data.progress);
            }
        }

        return () => {
            ws.close();
        }
    }, []);

    const onChange = e => {
        setFile(e.target.files[0]);
    };

    const onSubmit = async e => {
        e.preventDefault();

        if (!file) {
            setMessage('Please select a file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            setUploading(true);
            setMessage('Processing...');
            setProgress(0);

            const res = await axios.post('http://localhost:5000/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            const csvFileName = res.data.downloadUrl.split('/').pop();

            setMessage(`${csvFileName} successfully created!`);
            setDownloadUrl(res.data.downloadUrl);
            // setAlert(`${csvFileName} successfully created!`);
            setTimeout(() => {
                setMessage('');
            }, 10000);
            setModalIsOpen(true);
        } catch(err) {
            if (err.response && err.response.status === 500) {
                setMessage('There was a problem with the server.');
            } else if (err.response) {
                setMessage(err.response.data);
            } else {
                setMessage('An unknown error occurred.');
            }
            console.error('Error: ', err);
        } finally {
            setUploading(false);
            resetForm(); // Call reset function after handling the upload
        }
    };

    const resetForm = () => {
        setFile(null);
        // setMessage('');
        setProgress(0);
        // setModalIsOpen(false);
        // setDownloadUrl('');
    }

    const closeModal = () => {
        setModalIsOpen(false);
    }

    return (
        <div className={styles.fileUploadContainer}>
            <form className={styles.fileUploadForm} onSubmit={onSubmit}>
                <div>
                    <input type="file" onChange={onChange} />
                </div>
                <input type="submit" value={uploading ? "Uploading..." : "Upload"} />
            </form>
            {message && <p className={styles.statusText}>{message}</p>}
            {uploading && (
                <div className={styles.progressBar}>
                    {/* <p>Processing...</p> */}
                    <progress value={progress} max="100">{progress}%</progress>
                </div>
            )}
            {/* {alert && <div className="alert">{alert}</div>} */}
            <Modal className={styles.modal} isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel='Download CSV'>
                <div className={styles.modalContent}>
                    <h2>Download CSV</h2>
                    <p>Click the link below to download your CSV file:</p>
                    <a href={downloadUrl} download>Download CSV</a>
                    <button onClick={closeModal} title='Close Modal'>&#10006;</button>
                </div>
            </Modal>
        </div>
    );
}

export default FileUpload;