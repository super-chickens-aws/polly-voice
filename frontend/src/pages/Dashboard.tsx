import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { logout } from "../services/auth";
import { getProfile } from "../services/profile";

import { tts } from "../services/tts";
import { preview } from "../services/preview";

import { getHistory } from "../services/history";
import { downloadHistory } from "../services/historyDownload";

export default function Dashboard() {

    const navigate = useNavigate();

    const [user, setUser] = useState<any>(null);
    const [text, setText] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");
    const [voiceId, setVoiceId] = useState("Danielle");
    const [engine, setEngine] = useState("neural");
    const [speed, setSpeed] = useState(100);
    const [pitch, setPitch] = useState(0);
    const [volume, setVolume] = useState(100);
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        loadProfile();
        loadHistory();
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

    async function loadHistory() {

    try {

        const data = await getHistory();

        setHistory(data);

    }

    catch (error) {

        console.error(error);

    }

}

async function handleHistoryDownload(audioKey: string) {

    try {

        const data = await downloadHistory(audioKey);

        console.log("Download response:", data);

        const a = document.createElement("a");

        a.href = data.downloadUrl;

        a.target = "_self";

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);

    }

    catch (error) {

        console.error(error);

        alert("Download failed");

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
            engine,
            speed,
            pitch,
            volume

        });

        // Reload lịch sử
        await loadHistory();

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
                engine,
                speed,
                pitch,
                volume
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

        <h3>Speed</h3>

        <input
            type="range"
            min={50}
            max={200}
            step={10}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
        />

        <span>

            {" "}

            {speed}%

        </span>

        <br /><br />

        <h3>Pitch</h3>

        <input
            type="range"
            min={-20}
            max={20}
            step={5}
            value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))}
        />

        <span>

            {" "}

            {pitch}%

        </span>

            <br /><br />

            <h3>Volume</h3>

            <input
                type="range"
                min={0}
                max={200}
                step={10}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
            />

            <span>
                {" "}
                {volume}%
            </span>

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

            <hr />

<h2>History</h2>

{
    history.length === 0 ? (

        <p>No history.</p>

    ) : (

        history.map((item) => (

            <div
                key={`${item.userId}-${item.createdAt}`}
                style={{
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12
                }}
            >

                <p>
                    <b>Text:</b> {item.text}
                </p>

                <p>
                    <b>Voice:</b> {item.voiceId}
                </p>

                <p>
                    <b>Engine:</b> {item.engine}
                </p>

                <p>
                    <b>Speed:</b> {item.speed}%
                </p>

                <p>
                    <b>Pitch:</b> {item.pitch}%
                </p>

                <p>
                    <b>Volume:</b> {item.volume}%
                </p>

                <p>
                    <b>Date:</b>{" "}
                    {new Date(item.createdAt).toLocaleString()}
                </p>

                <button
    onClick={() => handleHistoryDownload(item.audioKey)}
>

    Download Again

</button>

            </div>

        ))

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