import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import BinaryBackground from '../components/BinaryBackground';
import '../styles/Login.css';
import Api from '../services/Api';

const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

const ResetPassword = () => {
  const query = useQuery();
  const navigate = useNavigate();
  const token = query.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = () => {
    if (!token) { setError('Invalid or expired reset link.'); return false; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return false; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return false; }
    return true;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isValid()) return;
    setLoading(true);
    try {
      const ok = await Api.resetPassword(token, newPassword);
      if (ok) {
        setSuccess('Password changed successfully. Redirecting to login...');
        setTimeout(() => navigate('/login'), 1500);
      } else {
        setError('Reset failed. Please request a new link.');
      }
    } catch (err) {
      setError('Reset failed. Please request a new link.');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-container">
      <BinaryBackground />
      <div className="login-form-container">
        <div className="form-header">
          <h2 className="login-title">CHANGE PASSWORD</h2>
          <p className="login-subtitle">Enter and confirm your new password</p>
        </div>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="new-password" className="form-label">New Password</label>
            <input id="new-password" type={show ? 'text' : 'password'} className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password" className="form-label">Confirm Password</label>
            <input id="confirm-password" type={show ? 'text' : 'password'} className="form-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>
          <div className="form-group" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input id="toggle" type="checkbox" onChange={e=>setShow(e.target.checked)} />
            <label htmlFor="toggle" className="form-label">Show password</label>
          </div>
          <button className="login-button" type="submit" disabled={loading}>{loading ? 'UPDATING...' : 'UPDATE PASSWORD'}</button>
        </form>
        <div className="register-link"><p><Link to="/login">Back to Login</Link></p></div>
      </div>
    </div>
  );
};

export default ResetPassword;


