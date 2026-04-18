import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workoutbridge",
  description: "Sync Strava workouts to Nike Running Club via Garmin Connect",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
