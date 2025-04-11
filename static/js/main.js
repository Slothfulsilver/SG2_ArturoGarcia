// Select the chart container and time aggregation dropdown
const prodChart = d3.select("#prod-chart");
const occChart = d3.select("#occ-chart");
const downChart = d3.select("#down-chart");

const timeAggregationDropdown = d3.select("#timeAggregation");

document.getElementById('runSimulation').addEventListener('click', () => {
    runSimulation();
});

let aggregatedData; // Store the fetched results globally
let intervalId; // Store the interval ID for occupancy chart

// Function to run the simulation and fetch data
async function runSimulation() {
    try {
        const response = await fetch('/run_simulation', {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const results = await response.json();
        aggregatedData = results; // Store the results

        startAnimation();

        // Initialize the line chart with the default selection (e.g., daily)
        const defaultPeriod = timeAggregationDropdown.property("value") || "daily";
        if (aggregatedData && aggregatedData[defaultPeriod]) {
            updateProdChart(aggregatedData[defaultPeriod]);
        }

    } catch (error) {
        console.error("Error running simulation:", error);
    }
}

// Event listener for time aggregation change
timeAggregationDropdown.on("change", function() {
    const selectedPeriod = d3.select(this).property("value");
    console.log("Selected time period:", selectedPeriod);
    if (aggregatedData && aggregatedData[selectedPeriod]) {
        updateProdChart(aggregatedData[selectedPeriod]);
        updateOccupancyChart(aggregatedData[selectedPeriod]);
    } else {
        console.warn(`No data found for the selected period: ${selectedPeriod}`);
        // Optionally clear the chart
        prodChart.selectAll("*").remove();
    }
});

function startAnimation() {
    clearInterval(intervalId); // Clear any existing interval

    const selectedPeriod = timeAggregationDropdown.property("value");
    if (aggregatedData && aggregatedData[selectedPeriod]) {
        let currentIndex = 0;
        const periodData = aggregatedData[selectedPeriod];

        intervalId = setInterval(() => {
            if (currentIndex < periodData.length) {
                updateOccupancyChart([periodData[currentIndex]]); // Pass data as an array
                updateDownChart([periodData[currentIndex]]);
                currentIndex++;
            } else {
                currentIndex = 0; // Loop back to the beginning
            }
        }, 1000) // Update every 5 seconds
    }
}

// Event listener for time aggregation change
timeAggregationDropdown.on("change", function() {
    clearInterval(intervalId); // Clear the previous interval for occupancy
    startAnimation(); // Start a new animation for occupancy

    // Update prod chart based on the selected period
    const selectedPeriod = d3.select(this).property("value");
    if (aggregatedData && aggregatedData[selectedPeriod]) {
        updateProdChart(aggregatedData[selectedPeriod]);
    } else {
        console.warn(`No data found for the selected period: ${selectedPeriod}`);
        prodChart.selectAll("*").remove();
    }
});

// Update the line chart
function updateProdChart(dataForPeriod) {

    prodChart.selectAll("*").remove();  // This will remove all existing elements

    const margin = { top: 20, right: 30, bottom: 60, left: 50 };
    const width = 1000 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    var innerHeight = height - margin.top - margin.bottom;
    var innerWidth = width - margin.left - margin.right;

    const selectedPeriod = timeAggregationDropdown.property("value");

    // Determine the title based on the selected period
    let chartTitle = "Complete Production of the Plant";
    if (selectedPeriod === "daily") {
        chartTitle += " Per Day";
    } else if (selectedPeriod === "weekly") {
        chartTitle += " Per Week";
    } else if (selectedPeriod === "monthly") {
        chartTitle += " Per Month";
    } else if (selectedPeriod === "yearly") {
        chartTitle += " Per Year";
    }
    
    const svg = prodChart.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    //Data
    const prodData = dataForPeriod.map(d =>( {
        period: d.period,
        avg_daily_prod: d.production.avg_daily_production
    }));

    //Scales
    const x = d3.scalePoint()
        .range([0, width])
        .padding(0.5);

    const y = d3.scaleLinear()
        .range([height, 0]);

    const line = d3.line()
        .x(d => x(d.period))
        .y(d => y(d.avg_daily_prod));

    x.domain(prodData.map(d => d.period));
    y.domain([d3.min(prodData, d => d.avg_daily_prod), d3.max(prodData, d => d.avg_daily_prod)]);

    svg.append("path")
        .data([prodData])
        .attr("class", "line")
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2);

    // Add x-axis (period labels)
    const xAxis = d3.axisBottom(x)
        .ticks(Math.floor(prodData.length / 30));
    
    const numXTicks = Math.min(prodData.length, 40); // Adjust '10' to your desired maximum
    xAxis.tickValues(x.domain().filter((d, i) => i % Math.ceil(prodData.length / numXTicks) === 0));

    svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(xAxis)
        
        .selectAll("text")
            .style("text-anchor", "end")
            .attr("transform", "rotate(-45)")
            .style("font-size", "10px")

    // Add y-axis
    svg.append("g")
        .call(d3.axisLeft(y));

    // Add chart title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .text(chartTitle);

    // Add x-axis label
    svg.append("text")
        .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Time Period");

    // Add y-axis label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -50)
        .attr("x", -(innerHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Average Daily Production");
   
}

// Update the occupancy chart
function updateOccupancyChart(dataForPeriod) {

    // Clear existing chart elements
    occChart.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 60, left: 50 };
    const width = 500 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = occChart.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Prepare data for the occupancy chart
    const occupancyData = [];
    let currentPeriodLabel = ""; // Initialize the label
    if (dataForPeriod && dataForPeriod[0]) {
        dataForPeriod[0].stations.forEach(station => {
            occupancyData.push({
                station: `Station ${station.id}`,
                occupancy: station.occupancy
            });
        });
        currentPeriodLabel = dataForPeriod[0].period; // Get the period label from data
    }

    // Scales for occupancy chart
    const xOccupancy = d3.scaleBand()
        .range([0, width])
        .padding(0.1);

    const yOccupancy = d3.scaleLinear()
        .range([height, 0]);

    xOccupancy.domain(occupancyData.map(d => d.station));
    yOccupancy.domain([0, d3.max(occupancyData, d => d.occupancy)]);

    // Create color scale
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Add bars for each workstation
    svg.selectAll(".bar")
        .data(occupancyData)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => xOccupancy(d.station))
        .attr("y", d => yOccupancy(d.occupancy))
        .attr("width", xOccupancy.bandwidth())
        .attr("height", d => height - yOccupancy(d.occupancy))
        .attr("fill", d => colorScale(d.station));

    // Add x-axis for occupancy
    const xAxisOccupancy = d3.axisBottom(xOccupancy);

    svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(xAxisOccupancy)
        .selectAll("text")
            .style("text-anchor", "middle")
            .attr("transform", "rotate(-45)")
            .attr("dx", "-.8em")
            .attr("dy", ".15em");

    // Add y-axis for occupancy
    svg.append("g")
        .call(d3.axisLeft(yOccupancy));

    // Get the selected period from the dropdown
    const selectedPeriod = timeAggregationDropdown.property("value");

    // Determine the title based on the selected period
    let chartTitle = "Occupancy per Workstation";
    if (selectedPeriod === "daily") {
        chartTitle += " (Daily)";
    } else if (selectedPeriod === "weekly") {
        chartTitle += " (Weekly)";
    } else if (selectedPeriod === "monthly") {
        chartTitle += " (Monthly)";
    } else if (selectedPeriod === "yearly") {
        chartTitle += " (Yearly)";
    }

    // Add chart title for Occupancy chart
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .text(chartTitle); // Use the dynamic title

    // Add x-axis label for Occupancy chart
    svg.append("text")
        .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Workstations");

    // Add y-axis label for Occupancy chart
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Occupancy");

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 30) // Position the label
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text(currentPeriodLabel);
}

function updateDownChart(dataForPeriod) {
    // Clear existing chart elements
    downChart.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 60, left: 50 };
    const width = 500 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = downChart.append("svg") // Corrected: append to downChart
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Prepare data for the occupancy chart
    const downData = [];
    let currentPeriodLabel = ""; // Initialize the label
    if (dataForPeriod && dataForPeriod[0]) {
        dataForPeriod[0].stations.forEach(station => {
            downData.push({
                station: `Station ${station.id}`,
                down: station.downtime
            });
        });
        currentPeriodLabel = dataForPeriod[0].period; // Get the period label from data
    }

    // Scales for occupancy chart
    const xDown = d3.scaleBand()
        .range([0, width])
        .domain(downData.map(d => d.station))
        .padding(0.1);

    const yDown = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(downData, d => d.down)]);

    // Create color scale
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Add bars for each workstation
    svg.selectAll(".bar")
        .data(downData)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => xDown(d.station))
        .attr("y", d => yDown(d.down)) // Use yDown for y-position
        .attr("width", xDown.bandwidth())
        .attr("height", d => height - yDown(d.down)) // Use yDown for height
        .attr("fill", d => colorScale(d.station));

    // Add x-axis for occupancy
    const xAxisDown = d3.axisBottom(xDown);

    svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(xAxisDown)
        .selectAll("text")
            .style("text-anchor", "middle")
            .attr("transform", "rotate(-45)")
            .attr("dx", "-.8em")
            .attr("dy", ".15em");

    // Add y-axis for occupancy
    svg.append("g")
        .call(d3.axisLeft(yDown));

    // Get the selected period from the dropdown
    const selectedPeriod = timeAggregationDropdown.property("value");

    // Determine the title based on the selected period
    let chartTitle = "Downtime per Workstation";
    if (selectedPeriod === "daily") {
        chartTitle += " (Daily)";
    } else if (selectedPeriod === "weekly") {
        chartTitle += " (Weekly)";
    } else if (selectedPeriod === "monthly") {
        chartTitle += " (Monthly)";
    } else if (selectedPeriod === "yearly") {
        chartTitle += " (Yearly)";
    }

    // Add chart title for Occupancy chart
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .text(chartTitle); // Use the dynamic title

    // Add x-axis label for Occupancy chart
    svg.append("text")
        .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Workstations");

    // Add y-axis label for Occupancy chart
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Downtime"); // Correct y-axis label

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 30) // Position the label
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text(currentPeriodLabel);
}