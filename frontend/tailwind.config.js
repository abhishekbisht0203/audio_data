/** @type {import('tailwindcss').Config} */
module.exports = {
  // ----------------------------------------------------
  // FIX: Added the NativeWind preset to resolve the error
  // ----------------------------------------------------
  presets: [require("nativewind/preset")],
  
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    './app/**/*.{js,jsx,ts,tsx}', 
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};