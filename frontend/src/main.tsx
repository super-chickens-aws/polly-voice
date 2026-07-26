import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { Amplify } from "aws-amplify";
import { awsConfig } from "./aws-config";

import App from "./App";

Amplify.configure(awsConfig);

ReactDOM.createRoot(
    document.getElementById("root")!
).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);