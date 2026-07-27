import { API_URL } from "../config";
import { fetchAuthSession } from "aws-amplify/auth";

export async function tts(data: any) {

    const session = await fetchAuthSession();

    const token = session.tokens?.accessToken?.toString();

    const response = await fetch(`${API_URL}/tts`, {

        method: "POST",

        headers: {

            "Content-Type": "application/json",

            Authorization: `Bearer ${token}`

        },

        body: JSON.stringify(data)

    });

    if (!response.ok) {

        throw new Error("TTS Failed");

    }

    return response.json();

}