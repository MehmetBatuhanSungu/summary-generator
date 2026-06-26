"use strict";

const generateButton = document.getElementById("generateButton");
const statusMessage = document.getElementById("statusMessage");
const transcriptText = document.getElementById("transcriptText");

generateButton.addEventListener("click", async () => {
  statusMessage.textContent = "Transcript aranıyor...";
  transcriptText.textContent = "";

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const activeTab = tabs[0];

  if (!activeTab || !isYouTubeVideoUrl(activeTab.url)) {
    statusMessage.textContent = "Lütfen bir YouTube video sayfası açın.";
    return;
  }

  let results;

  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: getTranscriptFromPage
    });
  } catch (error) {
    statusMessage.textContent = "Transcript okunurken bir hata oluştu.";
    return;
  }

  const transcriptResult = results[0]?.result;

  if (!transcriptResult || !transcriptResult.opened) {
    statusMessage.textContent = "Bu videoda transcript bulunamadı.";
    return;
  }

  if (!transcriptResult.text) {
    statusMessage.textContent = "Transcript paneli bulundu ama metin okunamadı.";
    return;
  }

  statusMessage.textContent = "Özet oluşturuluyor...";

  let summary;

  try {
    summary = await summarizeTranscript(transcriptResult.text, activeTab.id);
  } catch (error) {
    statusMessage.textContent = error.message;
    return;
  }

  statusMessage.textContent = "Özet sağ panele yazıldı.";
});

function isYouTubeVideoUrl(url) {
  const pageUrl = new URL(url);

  return pageUrl.hostname === "www.youtube.com" &&
    pageUrl.pathname === "/watch" &&
    pageUrl.searchParams.has("v");
}

async function summarizeTranscript(transcript, tabId) {
  const response = await chrome.runtime.sendMessage({
    type: "SUMMARIZE_TRANSCRIPT",
    transcript,
    tabId
  });

  if (!response.ok) {
    throw new Error(response.error || "Backend hatasi.");
  }

  return response.summary;
}

async function getTranscriptFromPage() {
  function isTranscriptButtonText(text) {
    const normalizedText = text.toLowerCase().trim();

    if (normalizedText.includes("generate transcript")) {
      return false;
    }

    return normalizedText === "transcript" ||
      normalizedText.includes("show transcript") ||
      normalizedText.includes("transkript");
  }

  async function waitForTranscriptText() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const text = getTranscriptText();

      if (text) {
        return text;
      }

      await wait(500);
    }

    return "";
  }

  function wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  function getTranscriptText() {
    const selectors = [
      "ytd-transcript-segment-renderer .segment-text",
      "ytd-transcript-segment-renderer yt-formatted-string",
      "ytd-transcript-segment-renderer"
    ];

    for (const selector of selectors) {
      const segments = document.querySelectorAll(selector);
      const lines = getTextLines(segments);

      if (lines.length > 0) {
        return lines.join("\n");
      }
    }

    return getTranscriptPanelText();
  }

  function getTextLines(segments) {
    const lines = [];

    for (const segment of segments) {
      const segmentLines = segment.innerText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !isTimestamp(line));

      lines.push(...segmentLines);
    }

    return lines;
  }

  function isTimestamp(text) {
    return /^\d+:\d+$/.test(text) || /^\d+:\d+:\d+$/.test(text);
  }

  function getTranscriptPanelText() {
    const panel = findVisibleTranscriptPanel();

    if (!panel) {
      return "";
    }

    const lines = panel.innerText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !isTranscriptUiLine(line));

    return lines.join("\n");
  }

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

  function isTranscriptUiLine(text) {
    const normalizedText = text.toLowerCase();

    return isTimestamp(text) ||
      normalizedText === "in this video" ||
      normalizedText === "chapters" ||
      normalizedText === "transcript" ||
      normalizedText === "search transcript";
  }

  function keepTranscriptPanelCompact() {
    const transcriptPanel = findVisibleTranscriptPanel();
    const panel = transcriptPanel?.closest("ytd-engagement-panel-section-list-renderer") || transcriptPanel;

    if (!panel) {
      return;
    }

    const video = document.querySelector("video");
    const videoRect = video?.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportHeight = window.innerHeight - panelRect.top - 12;
    const videoBottomHeight = videoRect ? videoRect.bottom - panelRect.top : viewportHeight;
    const panelHeight = Math.max(220, Math.floor(Math.min(viewportHeight, videoBottomHeight) - 16));

    document.documentElement.style.setProperty(
      "--yt-transcript-generator-panel-height",
      `${panelHeight}px`
    );

    panel.classList.add("youtube-transcript-generator-compact");
    addCompactTranscriptStyle();
  }

  function addCompactTranscriptStyle() {
    if (document.getElementById("youtube-transcript-generator-compact-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "youtube-transcript-generator-compact-style";
    style.textContent = `
      .youtube-transcript-generator-compact {
        height: var(--yt-transcript-generator-panel-height) !important;
        max-height: var(--yt-transcript-generator-panel-height) !important;
        overflow: hidden !important;
      }

      .youtube-transcript-generator-compact * {
        font-size: 11px !important;
        line-height: 1.25 !important;
      }

      .youtube-transcript-generator-compact #header,
      .youtube-transcript-generator-compact #tabs,
      .youtube-transcript-generator-compact #subheader,
      .youtube-transcript-generator-compact #search-panel {
        min-height: 0 !important;
        padding-top: 4px !important;
        padding-bottom: 4px !important;
      }

      .youtube-transcript-generator-compact h1,
      .youtube-transcript-generator-compact h2,
      .youtube-transcript-generator-compact h3,
      .youtube-transcript-generator-compact #title {
        font-size: 13px !important;
        line-height: 1.25 !important;
      }

      .youtube-transcript-generator-compact ytd-transcript-renderer,
      .youtube-transcript-generator-compact ytd-transcript-search-panel-renderer,
      .youtube-transcript-generator-compact #content,
      .youtube-transcript-generator-compact #body,
      .youtube-transcript-generator-compact #segments-container,
      .youtube-transcript-generator-compact #contents {
        max-height: calc(var(--yt-transcript-generator-panel-height) - 90px) !important;
        overflow-y: auto !important;
      }

      .youtube-transcript-generator-compact ytd-transcript-segment-renderer,
      .youtube-transcript-generator-compact ytd-transcript-segment-renderer yt-formatted-string,
      .youtube-transcript-generator-compact ytd-transcript-segment-renderer .segment-text {
        min-height: 0 !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
        font-size: 11px !important;
        line-height: 1.25 !important;
      }

      .youtube-transcript-generator-compact .segment-timestamp,
      .youtube-transcript-generator-compact #timestamp {
        font-size: 10px !important;
      }
    `;

    document.head.appendChild(style);
  }

  const buttons = document.querySelectorAll("button, [role='button']");

  for (const button of buttons) {
    const buttonText = button.innerText || button.getAttribute("aria-label") || "";

    if (isTranscriptButtonText(buttonText)) {
      button.click();
      await wait(500);
      keepTranscriptPanelCompact();

      const transcriptText = await waitForTranscriptText();
      keepTranscriptPanelCompact();

      return {
        opened: true,
        buttonText: buttonText.trim(),
        text: transcriptText
      };
    }
  }

  return {
    opened: false,
    buttonText: "",
    text: ""
  };
}
