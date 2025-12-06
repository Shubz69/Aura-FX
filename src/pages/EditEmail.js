import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/ProfileEdit.css";
import BinaryBackground from '../components/BinaryBackground';

const EditEmail = () => {
    const [email, setEmail] = useState("");
    const navigate = useNavigate();

    const handleSave = async (e) => {
        e.preventDefault();
        alert("Email updated!");
        navigate("/profile");
    };

    return (
        <div className="edit-container">
            <BinaryBackground />
            <h2>Edit Email</h2>
            <form onSubmit={handleSave}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter new email" required />
                <button type="submit">Save</button>
            </form>
        </div>
    );
};

export default EditEmail;