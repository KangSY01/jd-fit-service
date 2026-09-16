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

  const dot1 = document.getElementById('dot1');
  const dot2 = document.getElementById('dot2');
  const bar1 = document.getElementById('bar1');
  const stepLabel = document.getElementById('stepLabel');
  if(dot1 && dot2 && bar1){
    dot1.classList.toggle('active', step >= 1);
    dot2.classList.toggle('active', step >= 2);
    bar1.classList.toggle('filled', step >= 2);
  }
  if(stepLabel){
    stepLabel.textContent = step === 1 ? '1단계 · 공고 입력' : '2단계 · 프로젝트 정보 · 분석';
  }
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