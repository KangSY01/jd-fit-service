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

function initWizard(){
  goToStep(1);
  const nextBtn = document.getElementById('nextBtn');
  if(nextBtn){
    nextBtn.addEventListener('click', ()=>{
      goToStep(2);
    });
  }
  const prevBtn = document.getElementById('prevBtn');
  if(prevBtn){
    prevBtn.addEventListener('click', ()=>{
      goToStep(1);
    });
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initWizard);
} else {
  initWizard();
}