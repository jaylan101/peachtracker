import { NextRequest, NextResponse } from "next/server";

const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const BREVO_LIST_ID = 2; // "Your first list"

export async function POST(req: NextRequest) {
  try {
    const { email, firstName, lastName, source } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const attributes: Record<string, string> = {
      SOURCE: source || "website",
    };
    if (firstName) attributes.FIRSTNAME = firstName;
    if (lastName) attributes.LASTNAME = lastName;

    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        listIds: [BREVO_LIST_ID],
        attributes,
        updateEnabled: true,
      }),
    });

    if (res.status === 201 || res.status === 204) {
      return NextResponse.json({ ok: true });
    }

    const data = await res.json();

    if (data.code === "duplicate_parameter") {
      return NextResponse.json({ ok: true, exists: true });
    }

    console.error("Brevo error:", data);
    return NextResponse.json(
      { error: data.message || "Failed to subscribe" },
      { status: res.status }
    );
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
