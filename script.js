let uploadedPDFs = [];

// --- DOM Elements ---
const fileInput = document.getElementById("fileInput");
const uploadArea = document.querySelector(".upload-area");
const fileCount = document.getElementById("fileCount");
const uploadedFilesList = document.getElementById("uploadedFilesList");
const combineBtn = document.getElementById("combineBtn");
const progressSection = document.getElementById("progressSection");
const progressFill = document.getElementById("progressFill");
const status = document.getElementById("status");

// --- Drag and Drop ---
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const files = Array.from(e.dataTransfer.files).filter(
    (file) => file.type === "application/pdf",
  );
  handleFiles(files);
});

fileInput.addEventListener("change", (e) => {
  handleFiles(Array.from(e.target.files));
});

// --- Core Functions ---
async function handleFiles(files) {
  for (const file of files) {
    if (file.type === "application/pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = {
        name: file.name,
        size: file.size,
        data: arrayBuffer,
        id: Date.now() + Math.random(),
      };
      uploadedPDFs.push(pdf);
    }
  }
  updatePDFList();
}

function updatePDFList() {
  uploadedFilesList.innerHTML = "";
  uploadedPDFs.forEach((pdf) => {
    const previewEl = document.createElement("div");
    previewEl.className = "file-preview";
    previewEl.innerHTML = `
            <span class="file-name">${pdf.name}</span>
            <button class="remove-btn" data-id="${pdf.id}">✖</button>
        `;
    uploadedFilesList.appendChild(previewEl);
  });
  fileCount.textContent = `${uploadedPDFs.length} files`;
}

uploadedFilesList.addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-btn")) {
    const fileId = parseFloat(e.target.dataset.id);
    uploadedPDFs = uploadedPDFs.filter((pdf) => pdf.id !== fileId);
    updatePDFList();
  }
});

combineBtn.addEventListener("click", async () => {
  if (uploadedPDFs.length < 1) {
    showStatus("Please upload at least 1 PDF to process", "error");
    return;
  }

  showProgress("Processing and Combining PDFs...", "info");
  const { PDFDocument, PageSizes, rgb, StandardFonts } = PDFLib;
  const globalDeleteOption =
    document.getElementById("globalDeleteOption").value;
  const globalLayoutOption =
    document.getElementById("globalLayoutOption").value;

  try {
    const finalCombinedPdf = await PDFDocument.create();
    const timesRomanBoldFont = await finalCombinedPdf.embedFont(
      StandardFonts.TimesRomanBold,
    );
    let combinedPageCount = 0;

    // Sort PDFs alphabetically by name before processing
    const sortedPDFs = [...uploadedPDFs].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    for (let i = 0; i < sortedPDFs.length; i++) {
      const pdf = sortedPDFs[i];
      updateProgressBar(((i + 1) / sortedPDFs.length) * 100);

      // Step 1: Load the source document
      const sourceDoc = await PDFDocument.load(pdf.data);

      // Step 2: Apply page deletion by creating a filtered document
      let tempDoc;
      if (globalDeleteOption !== "none") {
        tempDoc = await PDFDocument.create();
        const totalPages = sourceDoc.getPageCount();
        const pagesToKeep = [];

        // Determine which pages to keep based on the selected option
        if (globalDeleteOption === "odd") {
          // Keep even-numbered pages (which have odd indices)
          for (let p = 0; p < totalPages; p++) {
            if ((p + 1) % 2 === 0) {
              pagesToKeep.push(p);
            }
          }
        } else if (globalDeleteOption === "even") {
          // Keep odd-numbered pages (which have even indices)
          for (let p = 0; p < totalPages; p++) {
            if ((p + 1) % 2 === 1) {
              pagesToKeep.push(p);
            }
          }
        }

        // Copy only the pages we want to keep into the new temp document
        const copiedPages = await tempDoc.copyPages(sourceDoc, pagesToKeep);
        copiedPages.forEach((page) => tempDoc.addPage(page));
      } else {
        // If no pages are to be deleted, use the original source document
        tempDoc = sourceDoc;
      }

      // Step 3: Apply layout and get the document to merge
      let docToMerge;
      if (globalLayoutOption === "1") {
        docToMerge = tempDoc;
      } else {
        // '2' pages per sheet
        const layoutDoc = await PDFDocument.create();
        const srcPages = tempDoc.getPages();

        for (let p = 0; p < srcPages.length; p += 2) {
          // Create a landscape page by explicitly using [height, width] from the PageSizes array
          const newPage = layoutDoc.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
          const { width: newWidth, height: newHeight } = newPage.getSize();

          const embeddedPage1 = await layoutDoc.embedPage(srcPages[p]);
          newPage.drawPage(embeddedPage1, {
            x: 5,
            y: 5,
            width: newWidth / 2 - 10,
            height: newHeight - 10,
          });

          // Draw a border around the first page
          newPage.drawRectangle({
            x: 5,
            y: 5,
            width: newWidth / 2 - 10,
            height: newHeight - 10,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
          });

          if (srcPages[p + 1]) {
            const embeddedPage2 = await layoutDoc.embedPage(srcPages[p + 1]);
            newPage.drawPage(embeddedPage2, {
              x: newWidth / 2 + 5,
              y: 5,
              width: newWidth / 2 - 10,
              height: newHeight - 10,
            });

            // Draw a border around the second page
            newPage.drawRectangle({
              x: newWidth / 2 + 5,
              y: 5,
              width: newWidth / 2 - 10,
              height: newHeight - 10,
              borderColor: rgb(0, 0, 0),
              borderWidth: 1,
            });
          }
        }
        docToMerge = layoutDoc;
      }

      // Step 4: Copy pages from the processed doc into the final combined doc and add page numbers
      const pageIndices = docToMerge.getPageIndices();
      const copiedPages = await finalCombinedPdf.copyPages(
        docToMerge,
        pageIndices,
      );

      for (const page of copiedPages) {
        finalCombinedPdf.addPage(page);
        combinedPageCount++;

        const pageNumberText = `${combinedPageCount}`;
        const fontSize = 12;
        const textWidth = timesRomanBoldFont.widthOfTextAtSize(
          pageNumberText,
          fontSize,
        );
        const x = page.getWidth() / 2 - textWidth / 2;
        const y = 15;

        page.drawText(pageNumberText, {
          x,
          y,
          size: fontSize,
          font: timesRomanBoldFont,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Step 5: Save and download the final result
    const combinedPdfBytes = await finalCombinedPdf.save();
    const blob = new Blob([combinedPdfBytes], {
      type: "application/pdf",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "combined-document.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus("PDFs combined successfully!", "success");
  } catch (error) {
    showStatus("Error combining PDFs: " + error.message, "error");
  }
});

// --- UI Helpers ---
function showProgress(message, type) {
  progressSection.style.display = "block";
  status.textContent = message;
  status.className = `status ${type}`;
  updateProgressBar(0);
}

function showStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
  setTimeout(() => {
    progressSection.style.display = "none";
  }, 5000);
}

function updateProgressBar(percent) {
  progressFill.style.width = percent + "%";
}

// --- Initialize ---
updatePDFList();
