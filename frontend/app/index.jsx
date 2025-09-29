import React, { useState, useEffect } from "react";
import { FaUpload, FaFileAudio, FaPlayCircle } from "react-icons/fa";
import '../global.css';

export default function UploadScreen() {
  const [file, setFile] = useState(null);
  const [audios, setAudios] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAudios = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/list-audios");
      const data = await res.json();
      setAudios(data);
    } catch (err) {
      console.error("Error fetching audios:", err);
    }
  };

  useEffect(() => {
    fetchAudios();
  }, []);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/upload-audio", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Server responded with status: ${res.status}`);
      }

      const data = await res.json();
      console.log("Upload Success:", data);
      setFile(null);
      fetchAudios();
    } catch (err) {
      console.error("Upload Error:", err);
    } finally {
      setLoading(false);
    }
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

        {/* File Upload */}
        <div className="w-full space-y-5 mb-8">
          <label className="w-full py-5 bg-white/80 rounded-2xl shadow-md flex items-center justify-center cursor-pointer border border-indigo-300 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-95">
            <FaUpload className="text-indigo-600 mr-2 text-xl" />
            <span className="text-indigo-700 font-semibold text-lg">Choose File</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className={`w-full py-4 rounded-2xl flex items-center justify-center font-semibold text-lg shadow-lg transition-all duration-300 transform ${
              loading || !file
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
                <circle
                  className="opacity-30"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-80"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.5 0 0 5.5 0 12h4z"
                ></path>
              </svg>
            ) : (
              <span>{file ? `Upload: ${file.name}` : "Select an Audio File"}</span>
            )}
          </button>
        </div>

        {/* Recent Uploads */}
        <h2 className="text-2xl font-bold text-gray-800 mb-4">🎶 Recently Uploaded</h2>

        <ul className="w-full space-y-3 max-h-64 overflow-y-auto pr-1">
          {audios.map((item) => (
            <li
              key={item.id ? item.id.toString() : item.file_name}
              className="w-full bg-white/80 rounded-2xl shadow-sm p-4 flex justify-between items-center border border-gray-200 transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
            >
              <span className="text-gray-900 font-medium flex-1 mr-4 truncate">
                {item.file_name}
              </span>
              <button
                onClick={() => console.log("Play:", item.file_url)}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full text-white font-semibold text-sm shadow-md transition-all duration-200 hover:scale-105 active:scale-95 flex items-center"
              >
                <FaPlayCircle className="mr-1" /> Listen
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
