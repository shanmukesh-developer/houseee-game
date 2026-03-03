import React from 'react';
import { io } from 'socket.io-client';

const getBackendUrl = () => {
    const envUrl = import.meta.env.VITE_BACKEND_URL;
    if (envUrl && envUrl.trim() !== '') return envUrl;

    const hostname = window.location.hostname;

    if (hostname.includes('render.com')) {
        console.error("VITE_BACKEND_URL is missing in Render environment variables!");
        return 'https://houseee-game-2.onrender.com';
    }

    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return `http://${hostname}:5000`;
    }

    return 'http://localhost:5000';
};

const backendUrl = getBackendUrl();
export const socket = io(backendUrl);
export const AppContext = React.createContext();
