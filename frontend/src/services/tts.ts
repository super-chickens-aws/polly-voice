import { API_URL } from "../config";
import { fetchAuthSession } from "aws-amplify/auth";

export async function tts(text: string) {

    const session = await fetchAuthSession();

    const token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_URL}/tts`, {

        method: "POST",

        headers: {

            "Content-Type": "application/json",

            Authorization: `Bearer ${token}`

        },

        body: JSON.stringify({

            text

        })

    });

    if (!response.ok) {

        throw new Error("TTS Failed");

    }

    return response.json();

}