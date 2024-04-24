---
layout: default
---

<div class="bg w3-display-container w3-light-grey" id="home">
  <div>
    <div class="w3-text-dark-gray punchline">
      <div class="title">
  Bring Your Story to  <span class="what-if">Life</span>
      </div>
      <div class="subtitle w3-text-dark-grey">
  Interactive Visual Story Platform
      </div>
    </div>
    <div class="w3-container signup">
      <form id="waitlist-form" action="https://formspree.io/f/mbjvygwp" method="POST">
        <input class="w3-input w3-border" id="email" name="email" type="email" placeholder="Email Address">
        <button id="my-form-button" class="w3-button w3-blue">Follow Us</button>
        <p id="waitlist-form-status"></p>
      </form>
      <div class="signup-text w3-text-dark-grey">
        We're shipping more stories with the community, follow us and stay tuned!
      </div>
    </div>
  </div>
</div>

<script>

var form = document.getElementById("waitlist-form");

async function handleWaitlist(event) {
    event.preventDefault();
    var status = document.getElementById("waitlist-form-status");

    var data = new FormData(event.target);
    fetch(event.target.action, {
    method: form.method,
    body: data,
    headers: {
        'Accept': 'application/json'
    }
    }).then(response => {
    if (response.ok) {
        status.innerHTML = "Thanks for joining our wait list!";
        form.reset()
    } else {
        response.json().then(data => {
        if (Object.hasOwn(data, 'errors')) {
            status.innerHTML = data["errors"].map(
            error => error["message"]
            ).join(", ")
        } else {
            status.innerHTML = "We apologize, but something went wrong."
        }
        })
    }
    }).catch(error => {
    status.innerHTML = "We apologize, but something went wrong."
    });
}
form.addEventListener("submit", handleWaitlist)

</script>
