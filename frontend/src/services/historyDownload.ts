import { API_URL } from "../config";
import { fetchAuthSession } from "aws-amplify/auth";

export async function downloadHistory(audioKey: string) {

    const session = await fetchAuthSession();

    const token = session.tokens?.accessToken?.toString();

    const response = await fetch(

        `${API_URL}/history/download`,

        {

            method: "POST",

            headers: {

                "Content-Type": "application/json",

                Authorization: `Bearer ${token}`

            },

            body: JSON.stringify({

                audioKey

            })

        }

    );

    if (!response.ok) {

        throw new Error("Download failed");

    }

    return response.json();

}