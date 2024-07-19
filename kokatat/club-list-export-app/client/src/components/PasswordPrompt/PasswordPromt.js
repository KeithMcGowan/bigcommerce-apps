import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import styles  from './PasswordPrompt.module.scss';

const PasswordPrompt = ({ onPasswordSubmit }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const isAuthenticated = sessionStorage.getItem('isAuthenticated');

        if (isAuthenticated === 'true') {
            onPasswordSubmit();
        }
    }, [onPasswordSubmit]);

    const handleSubmit = e => {
        e.preventDefault();

        // const correctPassword = 'zRWH!Vq2Jkh+my';
        const correctPassword = '111';

        if (password === correctPassword) {
            sessionStorage.setItem('isAuthenticated', 'true');
            onPasswordSubmit();
        } else {
            setError('Incorrect password.  Please try again.');
        }
    };

    const toggleShowPassword = () => {
        setShowPassword(!showPassword);
    }
    
    return (
        <div className={styles.passwordPrompt}>
            <form onSubmit={handleSubmit}>
                <label>
                    Enter Password:
                    <div className={styles.passwordInputWrapper}>
                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} />
                        <span onClick={toggleShowPassword} className={styles.passwordToggle}>
                            <FontAwesomeIcon icon={showPassword ? faEye : faEyeSlash}/>
                        </span>
                    </div>
                </label>
                <button className='button buttonPrimary' type='submit'>Submit</button>
            </form>
            {error && <p className={styles.error}>{error}</p>}
        </div>
    );
};

export default PasswordPrompt;