document.addEventListener('DOMContentLoaded', function() {
    const timelineContainer = document.getElementById('timeline-container');
    const loadingIndicator = document.querySelector('.loading-indicator');
    const popupElement = document.getElementById('event-popup');
    const popupTitle = document.getElementById('popup-title');
    const popupDate = document.getElementById('popup-date');
    const popupImageRotator = document.getElementById('popup-image-rotator');
    const popupDetails = document.getElementById('popup-details'); // Optional details element

    let timeline = null; // Holds the timeline instance
    let itemsDataSet = new vis.DataSet(); // Use DataSet for easier updates if needed
    let groupsDataSet = new vis.DataSet();
    let hoverTimeout = null; // To manage hover delays
    let isPopupPinned = false; // Track if popup is shown due to click

    // --- Configuration ---
    // !!! REPLACE WITH YOUR ACTUAL PUBLISHED GOOGLE SHEET URL (CSV format) !!!
    const googleSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS1ZZXRb9BBah62gJYvV2jzETTGTA7KrDBB5ObKS3RLvJ9m6jZNZC5y4htJTkWFCy3Hio5FcONsvldw/pub?output=csv';
    // Example: 'https://docs.google.com/spreadsheets/d/e/YOUR_SHEET_ID/pub?gid=0&single=true&output=csv';

    const defaultGroupName = "General Events"; // Name for events without a group

    // --- Data Fetching and Processing ---
    async function fetchData() {
        console.log('fetchData: Starting data fetch.');
        if (!googleSheetUrl || googleSheetUrl === 'YOUR_PUBLISHED_GOOGLE_SHEET_CSV_URL_HERE') {
             loadingIndicator.textContent = 'Error: Google Sheet URL not configured in script.js.';
             console.error('Error: Google Sheet URL not configured.');
             return;
        }

        try {
            console.log('fetchData: Fetching data from:', googleSheetUrl);
            const response = await fetch(googleSheetUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            console.log('fetchData: Data fetched successfully.');
            const csvData = await response.text();
            processData(csvData);
            loadingIndicator.style.display = 'none'; // Hide loading indicator
        } catch (error) {
            console.error('Error fetching or processing data:', error);
            timelineContainer.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">Failed to load timeline data. Check the console for details. Error: ${error.message}</div>`;
            loadingIndicator.style.display = 'none';
        }
        console.log('fetchData: Finished data fetch.');
    }

    function parseCSV(csvText) {
        console.log('parseCSV: Starting CSV parsing.');
        const lines = csvText.trim().split(/\r?\n/);
        if (lines.length < 2) {
            console.warn('parseCSV: No data rows found in CSV.');
            return []; // No data rows
        }

        const headers = lines[0].split(',').map(header => header.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            // Basic CSV parsing (doesn't handle commas within quoted fields robustly)
            // For more complex CSV, consider a dedicated library
             const values = lines[i].split(',');
             if (values.length === headers.length) {
                const entry = {};
                headers.forEach((header, index) => {
                    entry[header] = values[index].trim().replace(/^"|"$/g, ''); // Trim and remove surrounding quotes
                });
                data.push(entry);
             } else {
                 console.warn(`Skipping row ${i+1}: Incorrect number of columns.`);
             }
        }
        console.log('parseCSV: Finished CSV parsing. Parsed', data.length, 'rows.');
        return data;
    }

    function getRandomColor() {
        // Generate a random color in hex format
        return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
    }

    function processData(csvData) {
        console.log('processData: Starting data processing.');
        const rawEvents = parseCSV(csvData);
        const items = [];
        const groups = new Map(); // Use Map to easily handle unique groups

        rawEvents.forEach(event => {
            console.log('processData: Processing event:', event.ID);
            // Validate required fields
            if (!event.ID || !event.Title || !event['StartDateYear']) {
                console.warn('Skipping event due to missing ID, Title, or StartDate Year:', event);
                return;
            }

            // Construct dates - Be robust against missing month/day
            const startYear = parseInt(event['StartDateYear'], 10);
            const startMonth = event['StartDateMonth'] ? parseInt(event['StartDateMonth'], 10) : 1; // Default to Jan if missing
            const startDay = event['StartDateDay'] ? parseInt(event['StartDateDay'], 10) : 1; // Default to 1st if missing

            if (isNaN(startYear)) {
                 console.warn('Skipping event due to invalid StartDate Year:', event);
                 return;
            }

            // Ensure month and day are within valid ranges after defaulting
            const validStartMonth = Math.max(1, Math.min(12, startMonth));
            // Simple day validation (doesn't account for month length/leap year)
            const validStartDay = Math.max(1, Math.min(31, startDay));

            const startDate = `${startYear}-${String(validStartMonth).padStart(2, '0')}-${String(validStartDay).padStart(2, '0')}`;
            var typeName = 'point';
            let endDate = null;
            if (event['EndDateYear']) {
                const endYear = parseInt(event['EndDateYear'], 10);
                if (!isNaN(endYear)) {
                    const endMonth = event['EndDateMonth'] ? parseInt(event['EndDateMonth'], 10) : 12; // Default to Dec
                    const endDay = event['EndDateDay'] ? parseInt(event['EndDateDay'], 10) : 31; // Default to 31st
                    const validEndMonth = Math.max(1, Math.min(12, endMonth));
                    const validEndDay = Math.max(1, Math.min(31, endDay)); // Simple validation
                    endDate = `${endYear}-${String(validEndMonth).padStart(2, '0')}-${String(validEndDay).padStart(2, '0')}`;
                    typeName = 'range'
                }
            }

            // Determine group
            const groupName = event.Group ? event.Group.trim() : defaultGroupName;
            if (!groups.has(groupName)) {
                groups.set(groupName, { id: groupName, content: groupName });
                console.log('processData: Created new group:', groupName);
            }

            // Create timeline item
            const item = {
                id: event.ID.trim(),
                content: event.Title.trim(),
                start: startDate,
                end: endDate, // null if it's a point event
                group: groupName,
                type: typeName,                
                title: event.Title.trim(), // Default tooltip (can be customized further)
                //classname: "vis-item",
                //className: event.BackgroundColor ? `color-${event.BackgroundColor.toLowerCase().replace(/\s+/g, '-')}` : '', // Optional: use for styling
                // Store full data for popup
                fullData: event
            };            


            items.push(item);
            console.log('processData: Added item to timeline:', item.id);
        });

        // Add a default group if no events were assigned to it but it exists
        if (!groups.has(defaultGroupName) && items.some(item => item.group === defaultGroupName)) {
            groups.set(defaultGroupName, { id: defaultGroupName, content: defaultGroupName });
            console.log('processData: Created default group:', defaultGroupName);
        }

        itemsDataSet.add(items);
        groupsDataSet.add(Array.from(groups.values()));
        console.log('processData: Added', items.length, 'items and', groups.size, 'groups to data sets.');

        initializeTimeline();
        console.log('processData: Finished data processing.');
    }


    // --- Timeline Initialization ---
    function initializeTimeline() {
        console.log('initializeTimeline: Starting timeline initialization.');
        if (timeline) {
            console.log('initializeTimeline: Destroying existing timeline instance.');
            timeline.destroy(); // Destroy previous instance if exists
        }

        
        const options = {
            width: '100%',
            height: '100%', // Fill the container
            // Removed fixed height here, container controls it
            stack: true, // Stack items vertically to prevent overlap
            // stackSubgroups: true, // If you use subgroups within groups
            margin: {
                item: {
                    horizontal: 5,
                    vertical: 5
                }
            },
            orientation: 'both', // Time axis at the bottom
            zoomMin: 1000 * 60 * 60 * 24 * 300, // Approx 1 month minimum zoom
            zoomMax: 1000 * 60 * 60 * 24 * 365 * 100, // Approx 500 years maximum zoom
            min: '1700-01-01',
            max: new Date(new Date().getFullYear() + 5, 0, 1), // Initial end date (5 years into future)
            start: '1700-01-01', // Initial start date
            end: new Date(new Date().getFullYear() + 5, 0, 1), // Initial end date (5 years into future)
            editable: false, // Don't allow editing items on the timeline
            groupOrder: (a, b) => {
                if (a.content === "ERA") return 1; // Ensure "ERA" appears last
                if (b.content === "ERA") return -1;
                return a.content.localeCompare(b.content); // Alphabetical order for others
            },
            tooltip: {
                followMouse: true,
                overflowMethod: 'cap'
             },
             // Don't show default vis tooltips when popup is active
             onTimeout: 200, // Delay for itemover/itemout
             template: function (item) {
                // Custom template to include marker and line styling for events without an end date
                if (item.markerStyle && item.lineStyle) {
                    return `
                        <div style="${item.lineStyle}">
                            <div style="${item.markerStyle}"></div>
                            ${item.content}
                        </div>`;
                }
                return item.content;
            },
        };

        timeline = new vis.Timeline(timelineContainer, itemsDataSet, groupsDataSet, options);
        console.log('initializeTimeline: Timeline initialized.');

        // --- Event Listeners for Popups ---
        timeline.on('select', (properties) => {
            console.log('Timeline select event:', properties);
            if (properties.items.length > 0) {
                showPopup(properties.items[0], properties.event, true); // Pin popup on click
            } else {
                hidePopup(); // Hide if clicking outside items
            }
        });



    }

    // --- Popup Handling ---
    function showPopup(itemId, event, pinPopup) {
        console.log('showPopup: Showing popup for item:', itemId, 'Pinned:', pinPopup);
        const item = itemsDataSet.get(itemId);
        if (!item) {
            console.warn('showPopup: Item not found:', itemId);
            return;
        }

        // Populate Popup Content
        popupTitle.textContent = item.fullData.Title || 'No Title';

        let dateStr = formatDate(item.start);
        if (item.end && item.start !== item.end) {
            // Check if it's a single day event just represented with start/end
            const startDate = new Date(item.start);
            const endDate = new Date(item.end);
            // Adjust end date for inclusive display if needed (e.g., show 1800 for event ending 1800-12-31)
            // This logic depends on how you entered End Dates. Assuming end date is exclusive for ranges:
             const dayDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
             if(dayDiff <= 1 && startDate.toDateString() === endDate.toDateString()) {
                 // Effectively a single day
                 dateStr = formatDate(item.start);
             } else {
                 dateStr = `${formatDate(item.start)} to ${formatDate(item.end)}`;
             }
        }
        popupDate.textContent = dateStr;

        // Placeholder for image rotator - replace with actual logic later
        popupImageRotator.innerHTML = `[Image Rotator for ${item.fullData.Title}]`;

        // Optional: Add more details from fullData if available
        popupDetails.textContent = item.fullData.Description || ''; // Assuming a 'Description' column exists

        // Position Popup
        positionPopup(event);

        // Show Popup & Set Pin Status
        popupElement.style.display = 'block';
        requestAnimationFrame(() => { // Allows CSS transition to work
            popupElement.classList.add('visible');
        });
        isPopupPinned = pinPopup; // Set whether the popup should stay until closed
        console.log('showPopup: Popup shown.');
    }

    function positionPopup(event) {
         console.log('positionPopup: Positioning popup.');
         // Attempts to position popup near the mouse cursor, within viewport
         const PADDING = 15; // Space from cursor/edge
         const popupWidth = popupElement.offsetWidth;
         const popupHeight = popupElement.offsetHeight;
         const winWidth = window.innerWidth;
         const winHeight = window.innerHeight;

         let x = event.clientX;
         let y = event.clientY;

         // Adjust horizontal position
         if (x + popupWidth + PADDING > winWidth) {
             x = x - popupWidth - PADDING; // Place left of cursor
         } else {
             x = x + PADDING; // Place right of cursor
         }

         // Adjust vertical position
         if (y + popupHeight + PADDING > winHeight) {
             y = y - popupHeight - PADDING; // Place above cursor
         } else {
             y = y + PADDING; // Place below cursor
         }

         // Ensure popup doesn't go off-screen top or left
         x = Math.max(PADDING, x);
         y = Math.max(PADDING, y);

         popupElement.style.left = `${x}px`;
         popupElement.style.top = `${y}px`;
         console.log(`positionPopup: Popup positioned at x: ${x}, y: ${y}`);
     }


    window.hidePopup = () => { // Make hidePopup globally accessible for the button onclick
        console.log('hidePopup: Hiding popup.');
         popupElement.classList.remove('visible');
         // Wait for transition before hiding completely
         setTimeout(() => {
             if (!popupElement.classList.contains('visible')) { // Check if it wasn't shown again quickly
                 popupElement.style.display = 'none';
             }
         }, 150); // Should match transition duration
         isPopupPinned = false;
         console.log('hidePopup: Popup hidden.');
    }

    function isMouseOverPopup(event) {
        if (!event) return false;
        const isOver = popupElement.contains(event.target) || popupElement === event.target;
        console.log('isMouseOverPopup:', isOver);
        return isOver;
    }

     function formatDate(dateString) {
        // Basic date formatting, adjust as needed (e.g., locale, options)
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            // Add time zone offset to display the date as entered (avoids day shifts)
            const userTimezoneOffset = date.getTimezoneOffset() * 60000;
            const correctedDate = new Date(date.getTime() + userTimezoneOffset);
             // Check if only year was provided (e.g., "YYYY-01-01")
            if (correctedDate.toISOString().substring(5, 10) === '01-01') {
                return correctedDate.getFullYear().toString();
            }
            return correctedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            console.error("Error formatting date:", dateString, e);
            return dateString; // Return original string if parsing fails
        }
    }

    window.filterTimelineEvents = function() {
        const filterText = document.getElementById('filter-input').value.toLowerCase();
        const filteredItems = itemsDataSet.get({
            filter: item => item.content.toLowerCase().includes(filterText)
        });
        timeline.setItems(filteredItems);
    };
    // --- Initial Load ---
    console.log('DOMContentLoaded: Starting initial data fetch.');
    fetchData();

});
