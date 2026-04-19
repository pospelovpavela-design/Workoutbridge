import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Workoutbridge",
  description: "Sync Strava workouts to Nike Running Club via Garmin Connect",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
      </head>
      <body className="bg-gray-950 text-white min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
