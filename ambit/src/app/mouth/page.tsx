"use client";

/**
 * Legacy "/mouth" route — maintained for backward compatibility.
 * Immediately redirects visitors to the home page ("/").
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MouthPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/");
  }, [router]);
  
  return null;
}

