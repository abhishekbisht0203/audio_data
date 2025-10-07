import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    FaUpload,
    FaMicrophone,
    FaStopCircle,
    FaFilter,
    FaRedoAlt,
    FaFileAudio,
    FaDownload,
} from "react-icons/fa";

import "../global.css";

// API Base URL
const API_BASE_URL = "http://127.0.0.1:8000";

// --- Helper Hook for Audio Recording ---
const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingBlob, setRecordingBlob] = useState(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    const startRecording = async () => {
        if (!navigator.mediaDevices) {
            alert("Audio recording is not supported in this browser.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            
            chunksRef.current = [];
            mediaRecorderRef.current.ondataavailable = (e) => {
                chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm; codecs=opus' });
                setRecordingBlob(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setRecordingBlob(null);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const resetRecording = () => {
        setRecordingBlob(null);
        setIsRecording(false);
    };

    return { isRecording, recordingBlob, startRecording, stopRecording, resetRecording };
};
// ---------------------------------------

// --- NEW HELPER FUNCTION FOR TIMEZONE CONVERSION ---
const formatUtcToLocal = (utcTimestamp) => {
    if (!utcTimestamp) return '';
    // Use 'Z' if no timezone info is present to explicitly treat it as UTC
    const date = new Date(utcTimestamp.endsWith('Z') || utcTimestamp.includes('+') ? utcTimestamp : `${utcTimestamp}Z`);
    
    return date.toLocaleTimeString(navigator.language, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    });
};

/**
 * Converts local 'datetime-local' string (YYYY-MM-DDTHH:MM) to ISO string (UTC)
 */
const convertLocalToUTC = (localDateTime) => {
    if (!localDateTime) return "";
    const date = new Date(localDateTime); 
    return date.toISOString(); 
};
// ---------------------------------------------------


export default function UploadScreen() {
    const [uploadedFile, setUploadedFile] = useState(null);
    const [audios, setAudios] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    
    // Date Filtering State (Causing missing dependencies warning in the original code)
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState(""); 
    
    const { isRecording, recordingBlob, startRecording, stopRecording, resetRecording } = useAudioRecorder();
    const [recordDuration, setRecordDuration] = useState(0);
    
    // FIX 1: Keeping the state and using it in the cleanup useEffect below. 
    // (This line is correct, the fix is in the hook below it)
    const [previewAudioUrl, setPreviewAudioUrl] = useState(null); 


    // Timer for visual feedback
    useEffect(() => {
        let timer;
        if (isRecording) {
            setRecordDuration(0);
            timer = setInterval(() => {
                setRecordDuration(prev => prev + 1);
            }, 1000);
        } else {
            clearInterval(timer);
        }
        return () => clearInterval(timer);
    }, [isRecording]);

    // 💡 FIX 2: Audio Preview and Cleanup (Resolves Unused Variable Warning)
    // The previous implementation was slightly confusing. This one explicitly creates the URL 
    // and then uses `setPreviewAudioUrl` to save it. The cleanup hook below is now cleaner.
    useEffect(() => {
        if (recordingBlob) {
            const url = URL.createObjectURL(recordingBlob);
            setPreviewAudioUrl(url); 
        } else {
            setPreviewAudioUrl(null);
        }
    }, [recordingBlob]);
    
    // 💡 FIX 3: Cleanup Hook (Resolves Unused Variable Warning - final use)
    useEffect(() => {
        // This function runs on unmount OR when previewAudioUrl changes
        return () => {
            if (previewAudioUrl) {
                // USAGE APPLIED HERE: This resolves the 'eslint(no-unused-vars)' warning
                URL.revokeObjectURL(previewAudioUrl);
            } 
        };
    }, [previewAudioUrl]); // <-- Dependency must be included for proper cleanup

    // --- FIX 4: Stabilize fetchAudios with useCallback ---
    // This allows us to use fetchAudios as a dependency without causing infinite re-renders.
    // It also correctly uses the current state of startDate and endDate.
    const fetchAudios = useCallback(async (startLocal, endLocal) => {
        setLoading(true);
        let url = `${API_BASE_URL}/list-audios`;
        const params = new URLSearchParams();

        // Convert LOCAL datetime strings from input fields to UTC for the backend
        const startUTC = convertLocalToUTC(startLocal);
        const endUTC = convertLocalToUTC(endLocal);

        if (startUTC) {
            params.append("start_time", startUTC); 
        }
        if (endUTC) {
            params.append("end_time", endUTC);
        }

        if (params.toString()) {
            url = `${url}?${params.toString()}`;
        }

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch audios");
            const data = await res.json();
            setAudios(data);
        } catch (err) {
            console.error("Error fetching audios:", err);
        } finally {
            setLoading(false);
        }
    }, []); // Empty dependency array ensures this function is stable across renders

    // 💡 FIX 5: Primary Data Fetching Hook (Resolves Missing Dependencies Warning)
    // Resolves: "React Hook useEffect has missing dependencies: 'endDate' and 'startDate'."
    useEffect(() => {
        // When the component mounts OR when startDate or endDate change, re-fetch the data.
        // We use the current state of startDate and endDate in the call.
        fetchAudios(startDate, endDate);
        
        // This array ensures the hook re-runs only when the dates change or fetchAudios changes (it won't, due to useCallback)
    }, [startDate, endDate, fetchAudios]); // <-- FIX APPLIED HERE!

    // Handle file picker change
    const handleFileChange = (event) => {
        setUploadedFile(event.target.files[0]);
        resetRecording();
    };

    const fileToUpload = uploadedFile || recordingBlob;

    // --- Handle Upload (Uses fetchAudios to refetch) ---
    const handleUpload = async () => {
        if (!fileToUpload) return;
        setLoading(true);

        const formData = new FormData();
        const fileName = uploadedFile 
            ? uploadedFile.name 
            : `recorded-audio-${Date.now()}.webm`;
            
        formData.append("file", fileToUpload, fileName);

        try {
            const res = await fetch(`${API_BASE_URL}/upload-audio`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errorBody = await res.json();
                throw new Error(errorBody.detail || `Server responded with status: ${res.status}`);
            }
            
            setUploadedFile(null);
            resetRecording();
            setRecordDuration(0);
            
            // Refetch with current filters
            fetchAudios(startDate, endDate); 
        } catch (err) {
            console.error("Upload Error:", err);
            alert(`Upload Failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Handle Download ---
    const handleDownload = async (fileId, originalFileName) => {
        setDownloadingId(fileId);
        try {
            const res = await fetch(`${API_BASE_URL}/download-audio/${fileId}`);
            
            if (!res.ok) {
                throw new Error(`Download failed with status: ${res.status}`);
            }
            
            const blob = await res.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const baseName = originalFileName.includes('.') 
                ? originalFileName.split('.').slice(0, -1).join('.') 
                : originalFileName;

            a.download = `${baseName}_download.flac`; 
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error("Download Error:", err);
            alert(`Download failed: ${err.message}`);
        } finally {
            setDownloadingId(null);
        }
    };


    const handleFilter = () => {
        // Trigger fetch with the current local date-time inputs
        fetchAudios(startDate, endDate);
    };
    
    const handleResetFilters = () => {
        setStartDate("");
        setEndDate("");
        // After clearing, fetch all audios
        fetchAudios("", ""); 
    };

    const formatTime = (seconds) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };
    

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-400 via-purple-300 to-pink-300 font-sans">
            <div className="w-full max-w-xl p-8 bg-white/70 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/30 transition-all hover:shadow-purple-200">
                
                {/* Header */}
                <h1 className="text-4xl font-extrabold text-gray-800 mb-8 tracking-tight flex items-center justify-center">
                    <FaFileAudio className="mr-3 text-indigo-600 drop-shadow-md" />
                    <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        Audio Uploader
                    </span>
                </h1>

                {/* --- Recorder and File Picker Section --- */}
                <div className="space-y-4 mb-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-200">
                    <h2 className="text-xl font-bold text-indigo-700 mb-3">Record or Upload</h2>
                    
                    {/* Record Button */}
                    <div className="flex justify-between items-center space-x-2">
                        <button
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={loading || uploadedFile}
                            className={`flex-1 py-3 rounded-xl font-semibold text-lg shadow-md transition-all duration-300 transform flex items-center justify-center ${
                                isRecording 
                                ? "bg-red-500 text-white hover:bg-red-600 active:scale-95"
                                : "bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                            }`}
                        >
                            {isRecording ? <FaStopCircle className="mr-2" /> : <FaMicrophone className="mr-2" />}
                            {isRecording ? `Stop Recording (${formatTime(recordDuration)})` : "Start Recording"}
                        </button>
                        {recordingBlob && (
                            <button
                                onClick={resetRecording}
                                className="p-3 rounded-full bg-yellow-500 text-white hover:bg-yellow-600 transition-colors active:scale-95"
                                title="Clear Recording"
                            >
                                <FaRedoAlt />
                            </button>
                        )}
                    </div>

                    {/* Audio Preview */}
                    {previewAudioUrl && (
                        <div className="p-3 bg-white rounded-lg border border-indigo-200">
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Recorded Audio Preview</h3>
                            <audio controls src={previewAudioUrl} className="w-full" />
                        </div>
                    )}
                    
                    <div className="text-center text-sm text-gray-500 py-1">--- OR ---</div>
                    
                    {/* File Picker */}
                    <label className={`w-full py-3 rounded-xl shadow-md flex items-center justify-center cursor-pointer border transition-all duration-300 ${
                        isRecording || recordingBlob
                        ? "bg-gray-100 border-gray-300 cursor-not-allowed"
                        : "bg-white/80 border-indigo-300 hover:shadow-xl hover:scale-[1.02] active:scale-95"
                    }`}>
                        <FaUpload className="text-indigo-600 mr-2 text-xl" />
                        <span className="text-indigo-700 font-semibold text-lg truncate">
                            {uploadedFile ? `File: ${uploadedFile.name}` : "Choose File"}
                        </span>
                        <input
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={handleFileChange}
                            disabled={isRecording || recordingBlob}
                        />
                    </label>
                </div>

                {/* --- Upload Button --- */}
                <button
                    onClick={handleUpload}
                    disabled={loading || !fileToUpload}
                    className={`w-full py-4 rounded-2xl flex items-center justify-center font-semibold text-lg shadow-lg transition-all duration-300 transform mb-8 ${
                        loading || !fileToUpload
                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                        : "bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:scale-[1.02] hover:shadow-xl active:scale-95"
                    }`}
                >
                    {loading ? (
                        <svg
                            className="animate-spin h-6 w-6 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.5 0 0 5.5 0 12h4z"></path>
                        </svg>
                    ) : (
                        <span>{fileToUpload ? `Upload: ${uploadedFile?.name || 'Recorded Audio'}` : "Select Audio to Upload"}</span>
                    )}
                </button>
                
                {/* --- Filter Section --- */}
                <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                    <FaFilter className="mr-2 text-purple-600" /> Filter Uploads
                </h2>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1">
                        <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                            Start Date/Time (Local Time)
                        </label>
                        <input
                            id="startDate"
                            type="datetime-local"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg shadow-inner focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                        />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                            End Date/Time (Local Time)
                        </label>
                        <input
                            id="endDate"
                            type="datetime-local"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg shadow-inner focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleFilter}
                            disabled={loading}
                            className={`sm:mt-6 px-6 py-2 rounded-lg font-semibold text-sm shadow-md transition-all duration-300 transform ${
                                loading
                                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                                    : "bg-purple-500 text-white hover:bg-purple-600 active:scale-95"
                            }`}
                        >
                            Apply
                        </button>
                        <button
                            onClick={handleResetFilters}
                            className={`sm:mt-0 px-6 py-2 rounded-lg font-semibold text-sm shadow-md transition-all duration-300 transform bg-gray-400 text-white hover:bg-gray-500 active:scale-95`}
                        >
                            Reset
                        </button>
                    </div>
                </div>
                
                {/* --- Recent Uploads --- */}
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                    🎶 Recently Uploaded
                </h2>
                
                <ul className="w-full space-y-3 max-h-64 overflow-y-auto pr-1">
                    {audios.length > 0 ? (
                        audios.map((item) => (
                            <li
                                key={item.id}
                                className="w-full bg-white/80 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center border border-gray-200 transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
                            >
                                <div className="flex flex-col flex-1 mr-4 mb-2 sm:mb-0 min-w-0">
                                    <span className="text-gray-900 font-medium truncate">
                                        {item.metadata?.original_filename || item.file_name} 
                                    </span>
                                    {/* FIX 4: Displaying the created_at timestamp in local timezone */}
                                    <span className="text-xs text-gray-500 mt-1">
                                        Uploaded: {formatUtcToLocal(item.created_at)}
                                    </span>
                                </div>
                                
                                {/* DOWNLOAD/LISTEN BUTTON */}
                                <button
                                    onClick={() => handleDownload(item.id, item.metadata?.original_filename || item.file_name)}
                                    disabled={downloadingId === item.id}
                                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-teal-500 rounded-full text-white font-semibold text-sm shadow-md transition-all duration-200 hover:scale-105 active:scale-95 flex items-center disabled:bg-gray-400 disabled:cursor-wait shrink-0"
                                >
                                    {downloadingId === item.id ? (
                                        <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.5 0 0 5.5 0 12h4z"></path>
                                        </svg>
                                    ) : (
                                        <FaDownload className="mr-1" />
                                    )}
                                    {downloadingId === item.id ? 'Downloading...' : 'Download FLAC'}
                                </button>
                            </li>
                        ))
                    ) : (
                        <li className="text-center py-4 text-gray-500 italic">
                            {loading ? "Loading audios..." : "No audios found matching the criteria."}
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
}