import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/ProfileEdit.css";
import BinaryBackground from '../components/BinaryBackground';

const EditName = () => {
    const [name, setName] = useState("");
    const navigate = useNavigate();

    const handleSave = async (e) => {
        e.preventDefault();
        // Replace with actual API call
        alert("Name updated!");
        navigate("/profile");
    };

    return (
        <div className="edit-container">
            <BinaryBackground />
            <h2>Edit Name</h2>
            <form onSubmit={handleSave}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" required />
                <button type="submit">Save</button>
            </form>
        </div>
    );
};

export default EditName;