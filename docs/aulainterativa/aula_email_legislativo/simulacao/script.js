document.addEventListener('DOMContentLoaded', () => {
    // Garantir que temos dados
    if (typeof lessonData === 'undefined' || !lessonData || lessonData.length === 0) {
        alert('Erro: Arquivo data.js não carregado ou vazio.');
        return;
    }

    // Variáveis de Estado
    let currentStepIndex = 0;
    let currentSlideIndex = 0;
    const totalSteps = lessonData.length;
    const slideIndexes = buildSlideIndexes();
    const totalSlides = slideIndexes[totalSteps - 1] + 1;
    const viewedSlides = new Set();
    const endedSlides = new Set();
    const unlockedSlides = new Set();
    const urlParams = new URLSearchParams(window.location.search);
    const minSeconds = Math.max(0, Number(urlParams.get('min_seconds')) || 0);
    const reviewMode = urlParams.get('review') === '1';
    const unlockedFromSystem = Math.max(0, Math.min(totalSlides, Number(urlParams.get('unlocked_slides')) || 0));
    let remainingSeconds = 0;

    // Elementos da UI
    const stepImage = document.getElementById('step-image');
    const stepText = document.getElementById('step-text');
    const stepCounter = document.getElementById('step-counter');
    const progressBar = document.getElementById('progress-bar');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const finishScreen = document.getElementById('finish-screen');
    const btnFinish = document.getElementById('btn-finish');

    // Inicialização
    function init() {
        for (let slideIndex = 0; slideIndex < unlockedFromSystem; slideIndex++) {
            viewedSlides.add(slideIndex);
            unlockedSlides.add(slideIndex);
            endedSlides.add(slideIndex);
        }

        updateUI();
        
        // Listeners
        btnPrev.addEventListener('click', () => changeStep(-1));
        btnNext.addEventListener('click', () => changeStep(1));
        btnFinish.addEventListener('click', finishLesson);
        
        // Listener de Teclado
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') {
                changeStep(1);
            }
            if (e.key === 'ArrowLeft') changeStep(-1);
        });
    }

    function buildSlideIndexes() {
        let slideIndex = 0;
        return lessonData.map((step, index) => {
            if (index > 0 && step.image !== lessonData[index - 1].image) {
                slideIndex++;
            }
            return slideIndex;
        });
    }

    function changeStep(delta) {
        const newIndex = currentStepIndex + delta;
        
        if (newIndex >= 0 && newIndex < totalSteps) {
            const nextSlideIndex = slideIndexes[newIndex];
            if (delta > 0 && nextSlideIndex > currentSlideIndex) {
                postSlideEnd(currentStepIndex);
            }

            currentStepIndex = newIndex;
            updateUI();
        } else if (newIndex >= totalSteps) {
            postSlideEnd(currentStepIndex);
            finishScreen.classList.remove('hidden');
        }
    }

    function updateUI() {
        const step = lessonData[currentStepIndex];
        const nextSlideIndex = slideIndexes[currentStepIndex];
        const slideChanged = nextSlideIndex !== currentSlideIndex || !viewedSlides.has(nextSlideIndex);

        currentSlideIndex = nextSlideIndex;
        viewedSlides.add(currentSlideIndex);

        if (slideChanged) {
            postSlideStart();
            unlockCurrentSlide();
        }
        
        // Animação de fade do texto
        stepText.style.opacity = 0;
        
        setTimeout(() => {
            // Atualizar texto
            stepText.textContent = step.text;
            stepText.style.opacity = 1;
        }, 200);

        // Atualizar contador e barra
        stepCounter.textContent = `Texto ${currentStepIndex + 1} / ${totalSteps} · Slide ${currentSlideIndex + 1} / ${totalSlides}`;
        progressBar.style.width = `${((viewedSlides.size) / totalSlides) * 100}%`;

        btnPrev.disabled = currentStepIndex === 0;

        if (currentStepIndex === totalSteps - 1) {
            btnNext.classList.remove('btn-primary');
            btnNext.classList.add('btn-success');
        } else {
            btnNext.classList.remove('btn-success');
            btnNext.classList.add('btn-primary');
        }
        updateNextButtonState();

        // Atualizar Imagem
        const imagePath = `./assets/${step.image}`;
        if (stepImage.getAttribute('src') !== imagePath) {
            stepImage.style.opacity = 0.5;
            stepImage.onload = () => {
                stepImage.style.opacity = 1;
            };
            stepImage.src = imagePath;
        }
    }

    function unlockCurrentSlide() {
        unlockedSlides.add(currentSlideIndex);
        remainingSeconds = 0;
        updateNextButtonState();
        postViewProgress();
    }

    function updateNextButtonState() {
        const isLastStep = currentStepIndex === totalSteps - 1;

        btnNext.disabled = false;

        if (isLastStep) {
            btnNext.textContent = "Concluir";
        } else {
            btnNext.textContent = "Próximo";
        }
    }

    function postSlideStart() {
        postMessageToParent('INTERACTIVE_SLIDE_START', {
            module: 'email-legislativo',
            slide_index: currentSlideIndex + 1,
            total_slides: totalSlides,
            step_index: currentStepIndex + 1,
            total_steps: totalSteps,
            image: lessonData[currentStepIndex].image,
            min_seconds: minSeconds,
            unlocked_slides: unlockedSlides.size,
            review_mode: reviewMode,
            timestamp: Date.now()
        });
    }

    function postSlideEnd(stepIndex) {
        const slideIndex = slideIndexes[stepIndex];
        if (endedSlides.has(slideIndex)) return;
        endedSlides.add(slideIndex);

        postMessageToParent('INTERACTIVE_SLIDE_END', {
            module: 'email-legislativo',
            slide_index: slideIndex + 1,
            total_slides: totalSlides,
            step_index: stepIndex + 1,
            total_steps: totalSteps,
            image: lessonData[stepIndex].image,
            review_mode: reviewMode,
            timestamp: Date.now()
        });
    }

    function postViewProgress() {
        postMessageToParent('INTERACTIVE_VIEW_PROGRESS', {
            module: 'email-legislativo',
            percent: Math.round((viewedSlides.size / totalSlides) * 100),
            viewed_slides: viewedSlides.size,
            total_slides: totalSlides,
            current_slide: currentSlideIndex + 1,
            current_step: currentStepIndex + 1,
            total_steps: totalSteps,
            remaining_seconds: remainingSeconds,
            unlocked_slides: unlockedSlides.size,
            unlocked: unlockedSlides.has(currentSlideIndex) || reviewMode,
            review_mode: reviewMode
        });
    }

    function postMessageToParent(type, data) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type, data }, '*');
        }
    }

    // Função Exigida pelo Módulo: Enviar mensagem para o iFrame pai (score: 100)
    function finishLesson() {
        postSlideEnd(currentStepIndex);

        if (window.parent && window.parent !== window) {
            postMessageToParent('LESSON_PROGRESS', {
                score: 100,
                module: 'email-legislativo',
                total_slides: totalSlides,
                total_steps: totalSteps,
                review_mode: reviewMode
            });
        } else {
            alert('A simulação enviaria { score: 100 } para o sistema pai (ElegisCmon).');
        }
        finishScreen.classList.add('hidden');
    }

    // Run
    init();
});
