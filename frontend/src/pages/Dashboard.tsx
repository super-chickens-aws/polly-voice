import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { logout } from "../services/auth";
import { getProfile } from "../services/profile";
import { tts } from "../services/tts";

import { preview } from "../services/preview";

export default function Dashboard() {

    const navigate = useNavigate();

    const [user, setUser] = useState<any>(null);
    const [text, setText] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");
    const [voiceId, setVoiceId] = useState("Danielle");
    const [engine, setEngine] = useState("neural");

    useEffect(() => {
        loadProfile();
    }, []);

    async function loadProfile() {
        try {
            const data = await getProfile();
            setUser(data);
        } catch (error) {
            console.error(error);
            navigate("/");
        }

    }

    async function handleGenerate() {
        if (!text.trim()) {
            alert("Please enter some text.");
            return;
        }

        try {
            const data = await tts({

    text,

    voiceId,

    engine

});
            const a = document.createElement("a");
            a.href = data.downloadUrl;
            a.target = "_self";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        catch (error) {
            console.error(error);
            alert("Generate failed");
        }
    }

    async function handlePreview() {
        if (!text.trim()) {
            alert("Please enter some text.");
            return;
        }

        try {
            const url = await preview({

    text,

    voiceId,

    engine

});
            setPreviewUrl(url);
        }

        catch (error) {
            console.error(error);
            alert("Preview failed");
        }
    }

    async function handleLogout() {
        await logout();
        navigate("/");
    }

    return (
        <div style={{ padding: 30, maxWidth: 700 }}>
            <h1>Dashboard</h1>
            <hr />
            <h2>User</h2>
            <p><b>Email:</b> {user?.email}</p>
            <p><b>Display Name:</b> {user?.displayName || "-"}</p>
            <p><b>Role:</b> {user?.role}</p>
            <hr />
            <h2>Text To Speech</h2>
            <textarea
                rows={8}
                style={{ width: "100%" }}
                placeholder="Enter text..."
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            <h3>Voice</h3>

<select
    value={voiceId}
    onChange={(e) => setVoiceId(e.target.value)}
>

    <option value="Danielle">Danielle</option>

    <option value="Joanna">Joanna</option>

    <option value="Matthew">Matthew</option>

    <option value="Ruth">Ruth</option>

</select>

<br /><br />

<h3>Engine</h3>

<label>

    <input
        type="radio"
        value="neural"
        checked={engine === "neural"}
        onChange={(e) => setEngine(e.target.value)}
    />

    Neural

</label>

{" "}

<label>

    <input
        type="radio"
        value="standard"
        checked={engine === "standard"}
        onChange={(e) => setEngine(e.target.value)}
    />

    Standard

</label>

<br /><br />

            <br /><br />

            <button
                onClick={handlePreview}
            >
                Preview
            </button>

            {" "}

            <button
                onClick={handleGenerate}
            >
                Generate & Download
            </button>

            <hr />

            <br /><br />

            {
                previewUrl && (
                    <audio
                        controls
                        src={previewUrl}
                        style={{ width: "100%" }}
                    />
                )
            }

            <button
                onClick={handleLogout}
            >
                Logout
            </button>

        </div>
    );
}