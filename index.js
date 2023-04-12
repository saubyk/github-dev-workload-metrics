document.getElementById("metricsForm").addEventListener("submit", handleSubmit);
let userWorkloadChartInstance;

async function handleSubmit(event) {
  event.preventDefault();
  showSpinner();
  const githubToken = document.getElementById("githubToken").value;
  const repoOwner = document.getElementById("repoOwner").value;
  const repoName = document.getElementById("repoName").value;
  const milestoneTitle = document.getElementById("milestoneTitle").value;

  try {
    const { prMetrics, userWorkload } = await getMilestonePRs(githubToken, repoOwner, repoName, milestoneTitle);
    displayPRMetrics(prMetrics);
    displayUserWorkloadChart(userWorkload);
  } catch (error) {
    console.error("Error fetching metrics:", error);
  }
  hideSpinner();
}

function displayUserWorkloadChart(userWorkload) {
  if (userWorkloadChartInstance) {
    userWorkloadChartInstance.destroy();
  }

  const ctx = document.getElementById('userWorkloadChart').getContext('2d');
  const sortedUsernames = Object.keys(userWorkload).sort((a, b) => {
    return userWorkload[b].total - userWorkload[a].total;
  });

  const data = {
    labels: sortedUsernames,
    datasets: [
      {
        label: 'Assigned PRs',
        data: sortedUsernames.map((username) => userWorkload[username].assignedPRs),
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      },
      {
        label: 'Assigned Reviews',
        data: sortedUsernames.map((username) => userWorkload[username].assignedReviews),
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1
      }
    ]
  };

  const options = {
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };
  userWorkloadChartInstance = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: options
  });
}

function displayPRMetrics(prMetrics) {
  const prMetricsTableBody = document.getElementById("prMetricsTableBody");
  prMetricsTableBody.innerHTML = "";

  let table; // Add this line to declare the table variable

  prMetrics.forEach((pr) => {
    table = `
            <tr>
              <td><a href="${pr.prUrl}" target="_blank">${pr.prNumber}</a></td>
              <td>${pr.prTitle}</td>
              <td>${pr.assignee}</td>
              <td>${pr.reviewers.join(", ")}</td>
            </tr>
          `;
    prMetricsTableBody.insertAdjacentHTML("beforeend", table);
  });
}

async function getMilestonePRs(githubToken, repoOwner, repoName, milestoneTitle) {
  try {
    let allPRs = [];
    let page = 1;
    let hasNextPage = false;

    const headers = {
      'Authorization': `token ${githubToken}`,
    };
    do {
      let prs = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/pulls?state=open&per_page=100&page=${page}`,
        { headers }
      );
      prs = await prs.json();

      allPRs = [...allPRs, ...prs];
      hasNextPage = prs.length === 100;
      page++;
    } while (hasNextPage);

    const filteredPRs = allPRs.filter(
      (pr) => pr.milestone && pr.milestone.title === milestoneTitle
    );

    const prMetrics = [];
    const userWorkload = {};

    for (const pr of filteredPRs) {
      let reviews = await fetch(pr.review_comments_url, { headers });
      reviews = await reviews.json();
      let reviewRequests = await fetch(pr.url + "/requested_reviewers", { headers });
      reviewRequests = await reviewRequests.json();

      const assigneeLogin = pr.assignee ? pr.assignee.login : "";
      const reviewersFromComments = [
        ...new Set(
          reviews
            .map((review) => review.user.login)
            .filter((login) => login !== assigneeLogin)
        ),
      ];

      const reviewersFromRequests = reviewRequests.users.map((user) => user.login);

      const allReviewers = [...new Set([...reviewersFromComments, ...reviewersFromRequests])];

      // Update user workload
      if (assigneeLogin) {
        if (!userWorkload[assigneeLogin]) {
          userWorkload[assigneeLogin] = { assignedPRs: 0, assignedReviews: 0, total: 0 };
        }
        userWorkload[assigneeLogin].assignedPRs++;
        userWorkload[assigneeLogin].total++;
      }

      allReviewers.forEach((reviewer) => {
        if (!userWorkload[reviewer]) {
          userWorkload[reviewer] = { assignedPRs: 0, assignedReviews: 0, total: 0 };
        }
        userWorkload[reviewer].assignedReviews++;
        userWorkload[reviewer].total++;
      });

      prMetrics.push({
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.html_url,
        assignee: assigneeLogin,
        reviewers: allReviewers,
      });
    }

    return { prMetrics, userWorkload };
  } catch (error) {
    console.error("Error fetching PR metrics:", error.message);
  }
}

function showSpinner() {
  const spinner = document.getElementById('loadingSpinner');
  const dataDiv = document.getElementById('showData');
  spinner.style.display = 'inline-block';
  dataDiv.style.display = 'none';
}

function hideSpinner() {
  const spinner = document.getElementById('loadingSpinner');
  const dataDiv = document.getElementById('showData');
  spinner.style.display = 'none';
  dataDiv.style.display = 'inline-block';
}
