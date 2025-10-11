import "../global.css";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";

const API_BASE_URL = "https://audio-data.onrender.com";

const formatUtcToLocal = (utcTimestamp) => {
  if (!utcTimestamp) return "";
  const date = new Date(
    utcTimestamp.endsWith("Z") || utcTimestamp.includes("+")
      ? utcTimestamp
      : `${utcTimestamp}Z`
  );
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const convertLocalToUTC = (localDate) =>
  localDate ? localDate.toISOString() : "";

const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState(null);
  const recordingRef = useRef(null);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert("Permission required", "Microphone access is needed.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingUri(null);
    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert(
        "Error",
        "Could not start recording. Check microphone permissions."
      );
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current) return;
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      if (uri) setRecordingUri(uri);
      setIsRecording(false);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (err) {
      console.error("Failed to stop recording", err);
      Alert.alert("Error", "Failed to stop recording.");
    }
  };

  const resetRecording = () => {
    setRecordingUri(null);
    setIsRecording(false);
    recordingRef.current = null;
  };

  return {
    isRecording,
    recordingUri,
    startRecording,
    stopRecording,
    resetRecording,
  };
};

export default function AudioUploaderScreen() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [audios, setAudios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const {
    isRecording,
    recordingUri,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder();

  const [recordDuration, setRecordDuration] = useState(0);

  const playbackSoundRef = useRef(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  useEffect(() => {
    let timer;
    if (isRecording) {
      setRecordDuration(0);
      timer = setInterval(() => setRecordDuration((p) => p + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, "0")}:${sec
      .toString()
      .padStart(2, "0")}`;
  };

  const fetchAudios = useCallback(async (start, end) => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/list-audios`;
      const params = new URLSearchParams();
      const startUTC = convertLocalToUTC(start);
      const endUTC = convertLocalToUTC(end);
      if (startUTC) params.append("start_time", startUTC);
      if (endUTC) params.append("end_time", endUTC);
      if (params.toString()) url = `${url}?${params.toString()}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch audios");
      const data = await res.json();
      setAudios(data);
    } catch (err) {
      console.error("Error fetching audios:", err);
      Alert.alert("Error", "Failed to load audio list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudios(startDate, endDate);
  }, [startDate, endDate, fetchAudios]);

  const handleFileChange = async () => {
    if (isRecording || recordingUri) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setUploadedFile({ uri: file.uri, name: file.name });
      }
    } catch (err) {
      console.error("Document Picker Error:", err);
      Alert.alert("Error", "Failed to pick file.");
    }
    resetRecording();
  };

  const fileToUpload = uploadedFile?.uri || recordingUri;
  const fileName = uploadedFile?.name || `recorded-audio-${Date.now()}.m4a`;

  const handleUpload = async () => {
    if (!fileToUpload) return;
    setLoading(true);
    try {
      const uploadRes = await FileSystem.uploadAsync(
        `${API_BASE_URL}/upload-audio`,
        fileToUpload,
        {
          fieldName: "file",
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        }
      );

      if (uploadRes.status >= 400) {
        const errorBody = JSON.parse(uploadRes.body || "{}");
        throw new Error(
          errorBody.detail ||
            `Server responded with status: ${uploadRes.status}`
        );
      }

      setUploadedFile(null);
      resetRecording();
      setRecordDuration(0);
      fetchAudios(startDate, endDate);
      Alert.alert("Success", "Audio uploaded successfully!");
    } catch (err) {
      console.error("Upload Error:", err);
      Alert.alert(
        "Upload Failed",
        err.message || "An unknown error occurred during upload."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (fileId, originalFileName) => {
    setDownloadingId(fileId);
    try {
      const safeName = (originalFileName || `audio-${fileId}`).replace(
        /[^a-z0-9.]/gi,
        "_"
      );
      const dest = `${FileSystem.documentDirectory}${safeName}`;
      const downloadRes = await FileSystem.downloadAsync(
        `${API_BASE_URL}/download-audio/${fileId}`,
        dest
      );

      if (!downloadRes?.uri) throw new Error("Download failed");

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadRes.uri, {
          UTI: "public.audio",
          mimeType: "audio/flac",
        });
      } else {
        Alert.alert("Success", `File saved to: ${downloadRes.uri}`);
      }
    } catch (err) {
      console.error("Download Error:", err);
      Alert.alert(
        "Download failed",
        err.message || "An unknown error occurred during download."
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const playPreview = async (uri) => {
    try {
      if (!uri) return;
      if (playbackSoundRef.current) {
        try {
          await playbackSoundRef.current.unloadAsync();
        } catch (e) {}
        playbackSoundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync({ uri });
      playbackSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingPreview(false);
        }
      });

      setIsPlayingPreview(true);
      await sound.playAsync();
    } catch (err) {
      console.error("Playback Error:", err);
      Alert.alert("Playback failed", "Unable to play the audio.");
      setIsPlayingPreview(false);
    }
  };

  const stopPreview = async () => {
    try {
      if (!playbackSoundRef.current) return;
      await playbackSoundRef.current.stopAsync();
      await playbackSoundRef.current.unloadAsync();
      playbackSoundRef.current = null;
    } catch (err) {}
    setIsPlayingPreview(false);
  };

  useEffect(() => {
    return () => {
      if (playbackSoundRef.current) {
        playbackSoundRef.current.unloadAsync().catch(() => {});
        playbackSoundRef.current = null;
      }
    };
  }, []);

  const onChangeStartDate = (_, selectedDate) => {
    setShowStartDatePicker(false);
    if (selectedDate) setStartDate(selectedDate);
  };

  const onChangeEndDate = (_, selectedDate) => {
    setShowEndDatePicker(false);
    if (selectedDate) setEndDate(selectedDate);
  };

  const handleFilter = () => fetchAudios(startDate, endDate);
  const handleResetFilters = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const formatDateForDisplay = (date) =>
    date ? date.toLocaleString() : "Select Date/Time";

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, paddingVertical: 40 }}
      className="flex-1 bg-indigo-100"
    >
      <View className="max-w-2xl w-11/12 p-6 bg-white/95 rounded-3xl shadow-2xl mx-auto self-center">
        <View className="flex-row items-center justify-center mb-6 gap-2">
          <FontAwesome5 name="file-audio" size={24} color="#4f46e5" />
          <Text className="text-3xl font-bold text-indigo-600">
            Audio Uploader
          </Text>
        </View>

        <View className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 mb-6">
          <Text className="text-xl font-bold text-indigo-700 mb-3">
            Record or Upload
          </Text>

          <View className="flex-row gap-2 mb-3">
            <TouchableOpacity
              onPress={isRecording ? stopRecording : startRecording}
              disabled={loading || !!uploadedFile}
              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl gap-2 ${
                isRecording
                  ? "bg-red-500"
                  : loading || uploadedFile
                  ? "bg-gray-300"
                  : "bg-indigo-500"
              }`}
            >
              <MaterialCommunityIcons
                name={isRecording ? "stop-circle" : "microphone"}
                size={20}
                color="white"
              />
              <Text className="text-white font-semibold">
                {isRecording
                  ? `Stop Recording (${formatTime(recordDuration)})`
                  : "Start Recording"}
              </Text>
            </TouchableOpacity>

            {recordingUri && (
              <TouchableOpacity
                onPress={resetRecording}
                className="bg-yellow-500 px-3 rounded-xl items-center justify-center"
                disabled={loading}
              >
                <MaterialCommunityIcons name="redo" size={20} color="white" />
              </TouchableOpacity>
            )}
          </View>

          {(recordingUri || uploadedFile) && (
            <View className="p-3 bg-white rounded-lg border border-indigo-200 mb-3">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Audio Preview
              </Text>

              <View className="flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() =>
                    isPlayingPreview
                      ? stopPreview()
                      : playPreview(recordingUri || uploadedFile?.uri || "")
                  }
                  className="px-4 py-2 bg-indigo-500 rounded-lg"
                >
                  <Text className="text-white font-semibold">
                    {isPlayingPreview ? "Stop" : "Play"}
                  </Text>
                </TouchableOpacity>

                <Text className="text-sm text-gray-600 flex-1" numberOfLines={1}>
                  {uploadedFile?.name ||
                    recordingUri?.split("/").pop() ||
                    "Preview"}
                </Text>
              </View>
            </View>
          )}

          <Text className="text-center text-sm text-gray-500 py-2">
            --- OR ---
          </Text>

          <TouchableOpacity
            onPress={handleFileChange}
            disabled={isRecording || !!recordingUri}
            className={`flex-row items-center justify-center py-3 rounded-xl border ${
              isRecording || recordingUri
                ? "bg-gray-100 border-gray-300"
                : "bg-white/80 border-indigo-300"
            }`}
          >
            <MaterialCommunityIcons
              name="upload"
              size={20}
              color="#4f46e5"
              style={{ marginRight: 8 }}
            />
            <Text className="text-indigo-700 font-semibold text-base flex-1" numberOfLines={1}>
              {uploadedFile ? `File: ${uploadedFile.name}` : "Choose File"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleUpload}
          disabled={loading || !fileToUpload}
          className={`py-4 rounded-2xl items-center justify-center mb-6 ${
            loading || !fileToUpload
              ? "bg-gray-300"
              : "bg-gradient-to-r from-indigo-500 to-purple-600 bg-indigo-500"
          }`}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-white font-semibold">
              {fileToUpload
                ? `Upload: ${uploadedFile?.name || "Recorded Audio"}`
                : "Select Audio to Upload"}
            </Text>
          )}
        </TouchableOpacity>

        <View className="flex-row items-center gap-2 mb-4">
          <MaterialCommunityIcons name="filter" size={24} color="#9333ea" />
          <Text className="text-2xl font-bold text-gray-800">
            Filter Uploads
          </Text>
        </View>

        <View className="gap-4 mb-6">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">
              Start Date/Time
            </Text>
            <TouchableOpacity
              onPress={() => setShowStartDatePicker(true)}
              className="p-3 border border-gray-300 rounded-lg bg-white"
            >
              <Text className="text-gray-900">
                {formatDateForDisplay(startDate)}
              </Text>
            </TouchableOpacity>
            {showStartDatePicker && (
              <DateTimePicker
                value={startDate || new Date()}
                mode="datetime"
                display="default"
                onChange={onChangeStartDate}
              />
            )}
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">
              End Date/Time
            </Text>
            <TouchableOpacity
              onPress={() => setShowEndDatePicker(true)}
              className="p-3 border border-gray-300 rounded-lg bg-white"
            >
              <Text className="text-gray-900">
                {formatDateForDisplay(endDate)}
              </Text>
            </TouchableOpacity>
            {showEndDatePicker && (
              <DateTimePicker
                value={endDate || new Date()}
                mode="datetime"
                display="default"
                onChange={onChangeEndDate}
              />
            )}
          </View>

          <View className="flex-row gap-2 mt-2">
            <TouchableOpacity
              onPress={handleFilter}
              disabled={loading}
              className={`flex-1 px-6 py-3 rounded-lg ${
                loading ? "bg-gray-300" : "bg-purple-500"
              }`}
            >
              <Text className="text-white text-center font-semibold">
                Apply Filter
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleResetFilters}
              className="flex-1 px-6 py-3 rounded-lg bg-gray-400"
            >
              <Text className="text-white text-center font-semibold">
                Reset
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text className="text-2xl font-bold text-gray-800 mb-4">
          🎶 Recently Uploaded
        </Text>

        <ScrollView className="max-h-80">
          {audios.length > 0 ? (
            audios.map((item) => (
              <View
                key={item.id}
                className="bg-white/80 rounded-2xl p-4 flex-row justify-between items-center border border-gray-200 mb-3"
              >
                <View className="flex-1 mr-4 min-w-0">
                  <Text
                    className="text-gray-900 font-medium"
                    numberOfLines={1}
                  >
                    {item.metadata?.original_filename || item.file_name}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    Uploaded: {formatUtcToLocal(item.created_at)}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() =>
                    handleDownload(
                      item.id,
                      item.metadata?.original_filename || item.file_name
                    )
                  }
                  disabled={downloadingId === item.id}
                  className="px-4 py-2 bg-green-500 rounded-full flex-row items-center"
                >
                  {downloadingId === item.id ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <FontAwesome5
                        name="download"
                        size={12}
                        color="white"
                        style={{ marginRight: 6 }}
                      />
                      <Text className="text-white font-semibold">
                        Download
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text className="text-center py-4 text-gray-500 italic">
              {loading ? "Loading audios..." : "No audios found."}
            </Text>
          )}
        </ScrollView>
      </View>
    </ScrollView>
  );
}
