import {
    getHistory
} from "./src/services/index.js";

import {
    downloadHistoryHandler,
    getPreviewHandler,
    profileHandler,
    textToSpeechHandler,
} from "./src/handlers/index.js";

export const handler = async (event) => {

    const path = event.requestContext.http.path;

    // =============================
    // POST /tts/preview
    // =============================
    if (path === "/tts/preview") {
        const body = JSON.parse(event.body);
        return await getPreviewHandler(body);
    }

    // =============================
    // POST /tts
    // =============================
    if (path === "/tts") {
        return await textToSpeechHandler(event);
    }

    // =============================
    // GET /history
    // =============================
    if (path === "/history") {
        const userId = event.requestContext.authorizer.jwt.claims.sub;
        const history = await getHistory(userId);
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(history)
        };
    }

    // =============================
    // POST /history/download
    // =============================
    if (path === "/history/download") {
        const body = JSON.parse(event.body);
        return await downloadHistoryHandler(body);
    }

    // =============================
    // GET /auth/profile
    // =============================
    const claims = event.requestContext.authorizer.jwt.claims;
    return await profileHandler(claims);

};