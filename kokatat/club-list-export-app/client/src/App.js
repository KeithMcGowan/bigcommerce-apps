import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload/FileUpload';
import PasswordPrompt from './components/PasswordPrompt/PasswordPromt';
import './App.css';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const isAuthenticated = sessionStorage.getItem('isAuthenticated');

    if (isAuthenticated === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handlePasswordSubmit = () => {
    setIsAuthenticated(true);
  }

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };

  return (
    <div className="App">
      {isAuthenticated ? (
        <header className="App-header">
          <h1>CSV File Upload</h1>
          <FileUpload onLogout={handleLogout} />
          {/* <button onClick={handleLogout} style={{ marginTop: '30px' }}>Logout</button> */}
        </header>
      ) : (
        <PasswordPrompt onPasswordSubmit={handlePasswordSubmit} />
      )}
    </div>
  );
}

export default App;
