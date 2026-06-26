"use strict";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "SUMMARIZE_TRANSCRIPT") {
    return false;
  }

  summarizeTranscript(message.transcript)
    .then((summary) => {
      return showSummaryInTab(message.tabId, summary).then(() => summary);
    })
    .then((summary) => {
      sendResponse({
        ok: true,
        summary
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message
      });
    });

  return true;
});

async function showSummaryInTab(tabId, summary) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: replaceTranscriptPanelWithSummary,
    args: [summary]
  });
}

async function summarizeTranscript(transcript) {
  const response = await fetch("http://127.0.0.1:3000/summarize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transcript
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Backend hatasi.");
  }

  return data.summary;
}

function replaceTranscriptPanelWithSummary(summary) {
  const panel = findVisibleTranscriptPanel();

  if (!panel) {
    return;
  }

  panel.innerHTML = "";
  panel.appendChild(createSummaryElement(summary));

  function findVisibleTranscriptPanel() {
    const selectors = [
      "ytd-transcript-renderer",
      "ytd-transcript-search-panel-renderer",
      "ytd-engagement-panel-section-list-renderer"
    ];

    for (const selector of selectors) {
      const panels = document.querySelectorAll(selector);

      for (const panel of panels) {
        const text = panel.innerText || "";
        const normalizedText = text.toLowerCase();

        if (
          panel.offsetParent &&
          normalizedText.includes("transcript") &&
          normalizedText.includes("search transcript")
        ) {
          return panel;
        }
      }
    }

    return null;
  }

  function createSummaryElement(summaryText) {
    const wrapper = document.createElement("section");
    wrapper.style.padding = "18px 20px";
    wrapper.style.fontFamily = "Arial, sans-serif";
    wrapper.style.fontSize = "15px";
    wrapper.style.lineHeight = "1.55";
    wrapper.style.whiteSpace = "pre-wrap";
    wrapper.style.color = "#0f0f0f";
    wrapper.style.background = "#ffffff";
    wrapper.style.maxHeight = "calc(100vh - 160px)";
    wrapper.style.overflowY = "auto";

    const title = document.createElement("h2");
    title.textContent = "Video Özeti";
    title.style.margin = "0 0 16px";
    title.style.fontSize = "22px";
    title.style.fontWeight = "700";
    title.style.lineHeight = "1.3";

    const content = document.createElement("div");
    content.append(...createSummaryBlocks(summaryText));

    wrapper.appendChild(title);
    wrapper.appendChild(content);

    return wrapper;
  }

  function createSummaryBlocks(summaryText) {
    const lines = summaryText.split("\n");
    const blocks = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      if (isHeading(trimmedLine)) {
        const heading = document.createElement("h3");
        heading.textContent = trimmedLine;
        heading.style.margin = "18px 0 8px";
        heading.style.fontSize = "17px";
        heading.style.fontWeight = "700";
        heading.style.lineHeight = "1.35";
        blocks.push(heading);
        continue;
      }

      const paragraph = document.createElement("p");
      paragraph.textContent = trimmedLine;
      paragraph.style.margin = "0 0 10px";
      paragraph.style.fontSize = "15px";
      paragraph.style.fontWeight = "400";
      paragraph.style.lineHeight = "1.55";

      if (trimmedLine.startsWith("-") || trimmedLine.startsWith("*")) {
        paragraph.style.paddingLeft = "14px";
      }

      blocks.push(paragraph);
    }

    return blocks;
  }

  function isHeading(text) {
    return text.endsWith(":") ||
      text.startsWith("Başlık:") ||
      text.startsWith("Kısa özet:") ||
      text.startsWith("Kritik bilgiler:") ||
      text.startsWith("Uygulanabilir adımlar:") ||
      text.startsWith("Dikkat edilmesi gerekenler:");
  }
}
