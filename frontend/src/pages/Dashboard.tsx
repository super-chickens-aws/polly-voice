import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { logout } from "../services/auth";
import { getProfile } from "../services/profile";
import { tts } from "../services/tts";

export default function Dashboard() {

    const navigate = useNavigate();

    const [user, setUser] = useState<any>(null);

    const [text, setText] = useState("");

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

//     async function handleGenerate() {

//     if (!text.trim()) {

//         alert("Please enter some text.");

//         return;

//     }

//     try {

//         const data = await tts(text);

//         const response = await fetch(data.audioUrl);

//         const blob = await response.blob();

//         const url = window.URL.createObjectURL(blob);

//         const link = document.createElement("a");

//         link.href = url;

//         link.download = "speech.mp3";

//         document.body.appendChild(link);

//         link.click();

//         document.body.removeChild(link);

//         window.URL.revokeObjectURL(url);

//     } catch (error) {

//         console.error(error);

//         alert("Generate failed");

//     }

// }
    async function handleGenerate() {

        if (!text.trim()) {
            alert("Please enter some text.");
            return;
        }

        try {
            const data = await tts(text);
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

    function handlePreview() {
        alert("Preview feature will be implemented in /tts/preview.");
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

            <br /><br />

            <button
                onClick={handlePreview}
                disabled
            >
                Preview (Coming Soon)
            </button>

            {" "}

            <button
                onClick={handleGenerate}
            >
                Generate & Download
            </button>

            <hr />

            <button
                onClick={handleLogout}
            >
                Logout
            </button>

        </div>

    );

}