let currentStep = 1;

function goToStep(step){
  currentStep = step;
  const steps = document.querySelectorAll('[data-step]');
  steps.forEach(el => {
    if(Number(el.getAttribute('data-step')) === step){
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{
    goToStep(1);
    const nextBtn = document.getElementById('nextBtn');
    if(nextBtn){
      nextBtn.addEventListener('click', ()=>{
        goToStep(2);
      });
    }
  });
} else {
  goToStep(1);
  const nextBtn = document.getElementById('nextBtn');
  if(nextBtn){
    nextBtn.addEventListener('click', ()=>{
      goToStep(2);
    });
  }
}
