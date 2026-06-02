    import type { APIRoute } from "astro";
    import { Resend } from "resend";
    export const prerender = false;

    const resend = new Resend(import.meta.env.RESEND_API_KEY);

    export const POST: APIRoute = async ({ request }) => {
    const data = await request.formData();

    await resend.emails.send({
        from: "hq@jadh.ai",
        to: "hq@jadh.ai",
        subject: "رسالة جديدة من موقع جادة الأفق",
        html: `
        <p>الاسم: ${data.get("name")}</p>
        <p>الجوال: ${data.get("mobileNumber")}</p>
        <p>البريد: ${data.get("email")}</p>
        <p>الرسالة: ${data.get("message")}</p>
        `,
    });
    

    return new Response(null, {
        status: 303,
        headers: {
            Location: "/contact",
        },
    });
    };