import type { Metadata } from "next";
import { DemoConsole } from "@/components/demo-console";

export const metadata: Metadata = { title: "Presentation mode", description: "A focused ALIVE hackathon demonstration console." };

export default function DemoPage() { return <DemoConsole />; }
