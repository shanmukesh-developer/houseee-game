import React, { useEffect, useState, useContext, useRef } from 'react';
import { AppContext } from '../App';
import { Mic, MicOff } from 'lucide-react';

export default function VoiceChat() {
    const { user, socket, roomCode, gameState } = useContext(AppContext);
    const [isMuted, setIsMuted] = useState(true);
    const [stream, setStream] = useState(null);
    const peerConnectionRef = useRef(null);
    const remoteAudioRef = useRef(null);

    // Identify opponent
    const opponent = gameState?.players?.find(p => p.id !== user?.id);

    useEffect(() => {
        if (!opponent || !socket) return;

        // Initialize WebRTC
        const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        const pc = new RTCPeerConnection(configuration);
        peerConnectionRef.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtcIceCandidate', { roomCode, candidate: event.candidate, targetId: opponent.id });
            }
        };

        pc.ontrack = (event) => {
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = event.streams[0];
            }
        };

        const handleOffer = async ({ offer, callerId }) => {
            if (callerId !== opponent.id) return;
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtcAnswer', { roomCode, answer, targetId: callerId });
        };

        const handleAnswer = async ({ answer }) => {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        };

        const handleCandidate = async ({ candidate }) => {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('Error adding ice candidate', e);
            }
        };

        socket.on('webrtcOffer', handleOffer);
        socket.on('webrtcAnswer', handleAnswer);
        socket.on('webrtcIceCandidate', handleCandidate);

        return () => {
            socket.off('webrtcOffer', handleOffer);
            socket.off('webrtcAnswer', handleAnswer);
            socket.off('webrtcIceCandidate', handleCandidate);
            pc.close();
        };
    }, [opponent, socket, roomCode, gameState?.hostId, user?.id]);

    const toggleMic = async () => {
        if (!stream) {
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setStream(newStream);
                // add tracks to peer connection
                newStream.getTracks().forEach(track => {
                    peerConnectionRef.current?.addTrack(track, newStream);
                });
                setIsMuted(false);

                // Now that tracks are added, if I am the host (or just initiating for the first time), renegotiate/create offer
                const offer = await peerConnectionRef.current.createOffer();
                await peerConnectionRef.current.setLocalDescription(offer);
                socket.emit('webrtcOffer', { roomCode, offer, targetId: opponent.id, callerId: user.id });

            } catch (err) {
                console.error('Error accessing mic', err);
                alert('Microphone access denied or unavailable. Please check browser permissions.');
            }
        } else {
            // Toggle existing
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    if (!opponent) return null; // Only show if opponent is present

    return (
        <div className={`flex items-center gap-3 p-3 px-5 rounded-2xl backdrop-blur-xl border-2 transition-all duration-300 ${!isMuted ? 'bg-green-950/80 border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : 'bg-slate-900/80 border-slate-700/80 shadow-inner'}`}>
            <button
                onClick={toggleMic}
                className={`p-4 rounded-xl transition-all duration-300 flex items-center justify-center relative overflow-hidden group ${isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30' : 'bg-green-500 text-slate-950 hover:bg-green-400 shadow-[0_0_20px_rgba(34,197,94,0.8)] scale-110'}`}
                title={isMuted ? "Unmute Mic" : "Mute Mic"}
            >
                {!isMuted && <div className="absolute inset-0 bg-green-400 opacity-30 animate-ping"></div>}
                {isMuted ? <MicOff size={24} className="relative z-10 group-hover:scale-110 transition-transform" /> : <Mic size={24} className="relative z-10 group-hover:scale-110 transition-transform" />}
            </button>
            <div className="flex flex-col ml-1">
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] mb-0.5 ${!isMuted ? 'text-green-400' : 'text-slate-500'}`}>Live Comms</span>
                <span className="text-base font-bold text-white truncate max-w-[120px] drop-shadow-md">{opponent.name}</span>
            </div>
            {/* Hidden audio element to play remote stream */}
            <audio ref={remoteAudioRef} autoPlay />
        </div>
    );
}
