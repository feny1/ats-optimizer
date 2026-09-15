import { BASE_LATEX_TEMPLATE } from "./template";

export interface Env {
  AI: any; // Cloudflare Workers AI Binding
}

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(renderHTML(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/optimize") {
      try {
        const body = await request.json() as { jobTitle?: string; jobDescription?: string };
        const { jobTitle, jobDescription } = body;

        if (!jobTitle || !jobDescription) {
          return new Response(JSON.stringify({ error: "Job title and description are required." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // 1. استخراج الكلمات المفتاحية عبر Workers AI
        const targetKeywords = await extractKeywordsWorkersAI(env.AI, jobTitle, jobDescription);

        let currentLatex = BASE_LATEX_TEMPLATE;
        let iteration = 0;
        const maxIterations = 3;
        let report = evaluateATS(currentLatex, targetKeywords);

        // 2. حلقة المطابقة التكرارية الصادقة
        while (report.matchRate < 90 && iteration < maxIterations) {
          iteration++;

          const systemPrompt = `
You are a deterministic ATS Optimization Specialist and LaTeX Architect.
CRITICAL TRUTH RULES:
1. NEVER invent employers, job titles, degrees, or unearned certifications.
2. ONLY inject keywords if they logically clarify existing technical stacks or operational achievements.
3. Replace generic phrasing with industry-standard terminology (e.g. "Infrastructure as Code", "Multi-AZ", "Observability").
4. Strip math-mode delimiters from acronyms (use CI/CD not $CI/CD$; L2/L3 not $L2/L3$).
5. Preserve unified date ranges (Month YYYY -- Month YYYY).
6. Return ONLY the raw valid LaTeX document. No markdown formatting, no backticks, no conversational text.
`;

          const userPrompt = `
Target Job Title: ${jobTitle}
Current ATS Match Rate: ${report.matchRate}%
Target: >= 90%
Missing Valid Keywords: ${JSON.stringify(report.missingKeywords)}

Current Base LaTeX:
${currentLatex}
`;

          const aiResponse = await env.AI.run(AI_MODEL, {
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.1,
          });

          let candidateLatex: string = aiResponse.response ? aiResponse.response.trim() : "";

          // تنظيف أي markdown blocks قد يضيفها النموذج
          if (candidateLatex.startsWith("```latex")) {
            candidateLatex = candidateLatex.replace(/^```latex/, "").replace(/```$/, "").trim();
          } else if (candidateLatex.startsWith("```")) {
            candidateLatex = candidateLatex.replace(/^```/, "").replace(/```$/, "").trim();
          }

          const newReport = evaluateATS(candidateLatex, targetKeywords);
          currentLatex = candidateLatex;
          report = newReport;
        }

        return new Response(JSON.stringify({
          matchRate: report.matchRate,
          iterationsRun: iteration,
          matchedKeywords: report.matchedKeywords,
          missingKeywords: report.missingKeywords,
          tailoredLatex: currentLatex,
        }), {
          headers: { "Content-Type": "application/json" },
        });

      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

// فاحص حرفي برمجي صارم (Deterministic Regex Evaluator)
function evaluateATS(latexCode: string, keywords: string[]): {
  matchRate: number;
  matchedKeywords: string[];
  missingKeywords: string[];
} {
  const plainText = latexCode
    .replace(/\\(?:textbf|textit|emph|href|section|small)\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, " ")
    .toLowerCase();

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of keywords) {
    const cleanKw = kw.trim().toLowerCase();
    if (cleanKw.length > 0 && plainText.includes(cleanKw)) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  const matchRate = keywords.length > 0 
    ? Math.round((matchedKeywords.length / keywords.length) * 100) 
    : 100;

  return { matchRate, matchedKeywords, missingKeywords };
}

// استخراج الكلمات المفتاحية باستخدام Workers AI
async function extractKeywordsWorkersAI(ai: any, title: string, jd: string): Promise<string[]> {
  const prompt = `
Extract up to 20 high-impact technical keywords, hard skills, certifications, and compound terms from this JD for the job "${title}".
Return ONLY a comma-separated list of terms, nothing else.

JD:
${jd}
`;

  const res = await ai.run(AI_MODEL, {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.0,
  });

  const rawText: string = res.response || "";
  return rawText
    .split(",")
    .map((k: string) => k.replace(/[\n\r\-•*]/g, "").trim())
    .filter((k: string) => k.length > 1);
}

function renderHTML(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATS Resume Tailorer (Workers AI)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; padding: 2rem; margin: 0; }
    .container { max-width: 900px; margin: auto; }
    h1 { font-size: 1.4rem; margin-bottom: 1.5rem; color: #38bdf8; }
    label { display: block; margin-top: 1rem; margin-bottom: 0.4rem; font-weight: 600; font-size: 0.9rem; }
    input[type="text"], textarea { width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 6px; border: 1px solid #1e293b; background: #111827; color: #fff; font-family: inherit; font-size: 0.95rem; }
    textarea { height: 180px; resize: vertical; }
    button { margin-top: 1.5rem; width: 100%; padding: 0.8rem; border-radius: 6px; border: none; background: #0284c7; color: #fff; font-size: 1rem; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #0369a1; }
    .results { margin-top: 2rem; display: none; }
    .stats { display: flex; gap: 1rem; margin-bottom: 1rem; }
    .card { background: #111827; padding: 1rem; border-radius: 6px; flex: 1; text-align: center; border: 1px solid #1f2937; }
    .card span { font-size: 2rem; font-weight: bold; color: #34d399; display: block; }
    .btn-download { background: #059669; margin-top: 0.5rem; width: auto; padding: 0.5rem 1.5rem; }
    .btn-download:hover { background: #047857; }
    pre { direction: ltr; text-align: left; background: #030712; padding: 1rem; border-radius: 6px; overflow-x: auto; font-family: monospace; border: 1px solid #1f2937; max-height: 450px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>نظام مواءمة السيرة الذاتية (Cloudflare Workers AI المجاني)</h1>
    <label for="jobTitle">اسم الوظيفة المستهدفة:</label>
    <input type="text" id="jobTitle" placeholder="e.g. Systems Engineer / Cloud Lead">

    <label for="jobDescription">الوصف الوظيفي (Job Description):</label>
    <textarea id="jobDescription" placeholder="الصق الـ JD هنا..."></textarea>

    <button id="submitBtn" onclick="optimizeCV()">تحليل ومطابقة عبر Workers AI</button>

    <div class="results" id="results">
      <div class="stats">
        <div class="card">
          نسبة المطابقة المحققة
          <span id="matchRate">0%</span>
        </div>
        <div class="card">
          دورات التحسين المنفذة
          <span id="iterationsRun">0</span>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3>كود LaTeX النهائي المحدث (tailored.tex):</h3>
        <button class="btn-download" onclick="downloadLatex()">تحميل ملف .tex</button>
      </div>
      <pre><code id="latexOutput"></code></pre>
    </div>
  </div>

  <script>
    let generatedLatex = "";

    async function optimizeCV() {
      const btn = document.getElementById('submitBtn');
      const results = document.getElementById('results');
      const jobTitle = document.getElementById('jobTitle').value.trim();
      const jobDescription = document.getElementById('jobDescription').value.trim();

      if (!jobTitle || !jobDescription) {
        alert("يرجى إدخال اسم الوظيفة ووصفها");
        return;
      }

      btn.disabled = true;
      btn.innerText = "جاري المعالجة محلياً عبر Workers AI...";

      try {
        const response = await fetch("/api/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobTitle, jobDescription })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        generatedLatex = data.tailoredLatex;
        document.getElementById("matchRate").innerText = data.matchRate + "%";
        document.getElementById("iterationsRun").innerText = data.iterationsRun;
        document.getElementById("latexOutput").innerText = data.tailoredLatex;
        results.style.display = "block";
      } catch (err) {
        alert("خطأ: " + err.message);
      } finally {
        btn.disabled = false;
        btn.innerText = "تحليل ومطابقة عبر Workers AI";
      }
    }

    function downloadLatex() {
      const blob = new Blob([generatedLatex], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tailored.tex";
      a.click();
    }
  </script>
</body>
</html>`;
}
