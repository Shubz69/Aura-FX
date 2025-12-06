import React from "react";
import "../styles/Avatars.css";

const icons = ["🧠", "🤖", "🐱", "👾", "👨‍🚀", "🦾"];

const Avatars = ({ selected, setSelected }) => {
    return (
        <div className="avatar-list">
            {icons.map((icon, idx) => (
                <span
                    key={idx}
                    className={selected === icon ? "avatar selected" : "avatar"}
                    onClick={() => setSelected(icon)}
                >
                    {icon}
                </span>
            ))}
        </div>
    );
};

export default Avatars;