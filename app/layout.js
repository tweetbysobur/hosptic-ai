import { Manrope } from "next/font/google";
import "./globals.css";
import "../styles/showcase.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata = {
  title: {
    default: "Hosptic | Healthcare Data. Clearer Insights. Better Decisions.",
    template: "%s | Hosptic",
  },
  description:
    "Transform complex hospital datasets into meaningful insights. Ask questions, uncover patterns and understand your healthcare data with Hosptic.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F8F5F3",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB" className={manrope.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
