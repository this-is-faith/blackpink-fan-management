const errorMessage = document.querySelector('#login-error');
if (new URLSearchParams(window.location.search).get('error') === '1') {
  errorMessage.hidden = false;
}
