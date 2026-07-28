import { getDownloadUrl } from "../services/index.js";

export async function downloadHistoryHandler(body) {
    const { audioKey } = body;
    const downloadUrl = await getDownloadUrl(audioKey);

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            downloadUrl
        })
    };
}