import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Modal from 'react-modal';
import styles from "./FileUpload.module.scss";

Modal.setAppElement('#root');

const FileUpload = ({ onLogout }) => {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState('');
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState('');
    const [dragOver, setDragOver] = useState(false);

    const fileInputRef = useRef();

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
                },
                responseType: 'blob'
            });

            // Get header were file name is stored
            const contentDisposition = res.headers['content-disposition'];

            if (contentDisposition) {
                const filenameMatch = contentDisposition ? contentDisposition.match(/filename="(.+)"/) : null;
                const csvFileName = filenameMatch ? filenameMatch[1] : 'downloaded-file.csv';
                const downloadUrl = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));

                setMessage(`${csvFileName} successfully created!`);
                setDownloadUrl(downloadUrl);
                setModalIsOpen(true);
            } else {
                setMessage('Unexpected response format.');
            }

            setTimeout(() => {
                setMessage('');
            }, 10000);
        } catch (err) {
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
            resetForm();
        }
    };

    const resetForm = () => {
        setFile(null);
        setProgress(0);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }

    const closeModal = () => {
        setModalIsOpen(false);
        URL.revokeObjectURL(downloadUrl); // Clean up the object URL
    }

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = () => {
        setDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);

        const droppedFiles = e.dataTransfer.files;

        if (droppedFiles.length > 0) {
            setFile(droppedFiles[0]);
        }
    };

    return (
        <div>
            <div className={`${styles.dropZone} ${dragOver ? styles.dragOver : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                <label htmlFor="fileInput" style={{ display: "block", cursor: 'pointer', width: '100%', height: '100%' }}>
                    {file ? `Selected file: ${file.name}` : 'Drag and drop a file here, or click to select a file.'}
                </label>
                <input id='fileInput' type="file" onChange={onChange} className={styles.hiddenInput} ref={fileInputRef} />
            </div>
            <form onSubmit={onSubmit}>
                <input className="button buttonPrimary" type="submit" value={uploading ? "Uploading..." : "Upload"} />
            </form>
            <button className="button buttonSecondary" onClick={onLogout}>Logout</button>
            {message && <p className={styles.statusText}>{message}</p>}
            {uploading && (
                <div className={styles.progressBar}>
                    <progress value={progress} max="100">{progress}%</progress>
                    <p>{progress > 97 ? 'Finalizing...' : `${Math.round(progress)}%`}</p>
                </div>
            )}
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