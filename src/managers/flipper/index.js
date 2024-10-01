import DefaultViewManager from "../default";
import {defer, extend, isNumber, requestAnimationFrame} from "../../utils/core";
import {EVENTS} from "../../utils/constants";
import VIEW_FLIPPING_STATE from "../views/viewflippingstate";
import bezier from "bezier-easing";
import {PAGE_DRAGGING_EVENTS, PAGE_FLIPPING_EVENTS} from "../views/viewflippingevents";

/*
  Get the Y of the bezier curve at a given t
 */
const y1 = {x: 0.62, y: 0.02};
const y2 = {x: 0.79, y: 0.45};

const easingFunction = bezier(y1.x, y1.y, y2.x, y2.y);

const hiddenPagesZIndex = 0;
const visibleUnderPagesZIndex = 1;
const visibleReadablePagesZIndex = 2;
const outsideShadowWrapperZIndex = 3;
const flyingPagesZIndex = 4;
const glowingShadowZIndex = 5;

const setElementStyles = (element, styles) => {
    for (let key in styles) {
        element.style[key] = styles[key];
    }
};

class FlipperManager extends DefaultViewManager {
    constructor(options) {
        super(options);

        this.name = 'flipper';
        this.animationDurationMs = 800;

        /**
         * We want to allow only one animation at the time, otherwise they would interfere with each other.
         * So the next page turn can only happen after the previous one has finished.
         * @type {boolean}
         */
        this.isFlipping = false;

        /**
         * How much we have dragged the page with the touch action.
         * @type {number}
         */
        this.dragProgression = 0;

        this.outsideShadowWrapperId = 'outside-shadow-wrapper';
        this.outsideShadowElementId = 'outside-shadow';
        this.bendingShadowElementId = 'bending-shadow';

        this.outsideShadowWrapperFlippingClass = 'outside-shadow-wrapper-flipping';
        this.outsideShadowFlippingLeftClass = 'outside-shadow-flipping-left';
        this.outsideShadowFlippingRightClass = 'outside-shadow-flipping-right';
        this.bendingShadowFlippingLeftClass = 'bending-shadow-flipping-left';
        this.bendingShadowFlippingRightClass = 'bending-shadow-flipping-right';
    }

    isRightToLeft() {
        return this.settings.direction === 'rtl';
    }

    /**
     * The flipping display manager works only with FlippingIframeView, which requires a viewFlippingState
     *
     * @returns {View}
     */
    createView(section, forceRight, viewFlippingState) {
        const view = new this.View(section, extend(this.viewSettings, {forceRight, viewFlippingState}));

        view.on(PAGE_FLIPPING_EVENTS.SWIPE_LEFT, () => {
            this.emit(PAGE_FLIPPING_EVENTS.SWIPE_LEFT);
        });

        view.on(PAGE_DRAGGING_EVENTS.DRAG_START, (event) => {
            this.draggingDirection = event.direction;

            console.log("dragging started", this.draggingDirection);
        });

        view.on(PAGE_DRAGGING_EVENTS.DRAG_MOVE, (event) => {

            const touchEvent = event.touches[0];
            const clientX = touchEvent.clientX;

            this.movePagesByDrag(clientX);
        });

        view.on(PAGE_DRAGGING_EVENTS.DRAG_END, () => {
            /* Reset the page, take it back to the start.
            ⚠️ Important! We assume that the swipe event is triggered before the drag end.
            So during a natural swiping movement, we handle the swipe first, so the drag+swipe was already handled
            when PAGE_DRAGGING_EVENTS.DRAG_END is triggered.
            * */
            if (!!this.draggingDirection) {
                /* Swipe event should also reset drag direction. If it didn't, means that a natural swipe DID NOT happen.
                 Reset the page
                 */
                this.resetDraggedPages();
            }
        });

        return view;
    }

    getProgressionByDragX(clientX) {
        const pageSize = this.getPageSize();
        const pageWidth = pageSize.width;

        const dragSize = this.draggingDirection === 'LEFT' ? Math.max(0, pageWidth - clientX)
            : Math.max(0, clientX - pageWidth - pageSize.diffBetweenIframeWidthAndBodyWidth);

        /**
         * When the user drags a page, we want to feel like the page corner is "under the finger",
         * and not ending exactly where the finger is.
         * Since the page turn animation has a bigger angle at the beginning, we need to adjust the "finger size".
         */
        const progressionBeforeConsideringFingerSize = Math.max(0, Math.min(1, dragSize / pageWidth));
        const maxFingerWidth = 50;
        const fingerSize = maxFingerWidth * (1 - progressionBeforeConsideringFingerSize);

        const howMuchDidPageMove = dragSize + fingerSize;
        const xOffset = howMuchDidPageMove / 2;

        return Math.max(0, Math.min(1, xOffset / pageWidth));
    }

    movePagesByDrag(clientX) {
        if (!this.draggingDirection) {
            return;
        }
        if (this.isFlipping) {
            return;
        }

        const progression = this.getProgressionByDragX(clientX);

        // Saving this for resetting or continuing the animation
        this.dragProgression = progression;

        // TODO - for flipping to right
        this.setInstanceFlipToLeftStyles(progression);
    }

    resetDraggedPages() {
        this.animateRightToLeftFlip('BACKWARDS');
    }

    setInstanceFlipToLeftStyles(progression) {
        // TODO - fix all this duplication
        const rightVisibleView = this.findRightVisibleView() || this.findRightVisibleViewFlippingLeft();
        const flippableFromRightOnLeftSideView = this.findFlippableFromRightOnLeftSideView() || this.findFlippingFromRightOnLeftSideView();
        const flippableFromRightOnRightSideView = this.findFlippableFromRightOnRightSideView() || this.findFlippingFromRightOnRightSideView();


        if (!rightVisibleView || !flippableFromRightOnLeftSideView) {
            console.log("Next pages not found, can't flip");
            return false;
        }

        rightVisibleView.setFlippingState(VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT);
        flippableFromRightOnLeftSideView.setFlippingState(
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT,
        );
        if (flippableFromRightOnRightSideView) {
            flippableFromRightOnRightSideView.setFlippingState(
                VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT,
            );
        }

        const outsideShadowWrapperElement = document.getElementById(this.outsideShadowWrapperId);
        const outsideShadowElement = document.getElementById(this.outsideShadowElementId);
        const bendingShadowElement = document.getElementById(this.bendingShadowElementId);

        outsideShadowWrapperElement.classList.add(this.outsideShadowWrapperFlippingClass);
        outsideShadowElement.classList.add(this.outsideShadowFlippingLeftClass);
        bendingShadowElement.classList.add(this.bendingShadowFlippingLeftClass);

        const animationStyles = this.getFlippingAnimationStyles(progression);

        this.setVisibleViewStyles(rightVisibleView, animationStyles.rightViewElement);
        this.setVisibleViewStyles(
            flippableFromRightOnLeftSideView,
            animationStyles.flippableFromRightOnLeftSideViewElement,
        );

        if (flippableFromRightOnRightSideView) {
            this.setVisibleViewStyles(
                flippableFromRightOnRightSideView,
                animationStyles.flippableFromRightOnRightSideViewElement,
            );
        }

        setElementStyles(outsideShadowElement, {
            ...animationStyles.flippableFromRightOnLeftSideViewElement,
            ...animationStyles.outsideShadowElement,
        });

        setElementStyles(outsideShadowWrapperElement, animationStyles.outsideShadowWrapperElementFlippingLeft);
        setElementStyles(bendingShadowElement, {
            ...animationStyles.flippableFromRightOnLeftSideViewElement,
            ...animationStyles.bendingShadowFLippingLeft,
        });
    }


    animateRightToLeftFlip(animationDirection) {
        if (this.isFlipping) {
            return;
        }
        this.isFlipping = true;

        /*
            If the animation direction is BACKWARDS, it means we want to reset the pages to the original state.
            This means that we have already dragged the pages, so we need to search also for the pages that are flipping.
         */
        const rightVisibleView = this.findRightVisibleView() || (
            animationDirection === 'BACKWARDS' ? this.findRightVisibleViewFlippingLeft() : null
        );
        const flippableFromRightOnLeftSideView = this.findFlippableFromRightOnLeftSideView() || (
            animationDirection === 'BACKWARDS' ? this.findFlippingFromRightOnLeftSideView() : null
        );
        const flippableFromRightOnRightSideView = this.findFlippableFromRightOnRightSideView() ||
            (animationDirection === 'BACKWARDS' ? this.findFlippingFromRightOnRightSideView() : null);

        if (!rightVisibleView || !flippableFromRightOnLeftSideView) {
            console.log("Next pages not found, can't flip");
            this.isFlipping = false;
            return false;
        }

        rightVisibleView.setFlippingState(VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT);
        flippableFromRightOnLeftSideView.setFlippingState(
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT,
        );
        if (flippableFromRightOnRightSideView) {
            flippableFromRightOnRightSideView.setFlippingState(
                VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT,
            );
        }

        const outsideShadowWrapperElement = document.getElementById(this.outsideShadowWrapperId);
        const outsideShadowElement = document.getElementById(this.outsideShadowElementId);
        const bendingShadowElement = document.getElementById(this.bendingShadowElementId);

        outsideShadowWrapperElement.classList.add(this.outsideShadowWrapperFlippingClass);
        outsideShadowElement.classList.add(this.outsideShadowFlippingLeftClass);

        bendingShadowElement.classList.add(this.bendingShadowFlippingLeftClass);

        let animationStartTimestamp = null;
        const animationDurationLeft = this.getAnimationDurationLeft(animationDirection);

        const animationCallback = (timestamp) => {
            if (!animationStartTimestamp) {
                animationStartTimestamp = timestamp;
            }

            const elapsed = timestamp - animationStartTimestamp;

            const progression = this.getAnimationProgression(elapsed, animationDirection);

            const animationStyles = this.getFlippingAnimationStyles(progression);

            this.setVisibleViewStyles(rightVisibleView, animationStyles.rightViewElement);
            this.setVisibleViewStyles(
                flippableFromRightOnLeftSideView,
                animationStyles.flippableFromRightOnLeftSideViewElement,
            );

            if (flippableFromRightOnRightSideView) {
                this.setVisibleViewStyles(
                    flippableFromRightOnRightSideView,
                    animationStyles.flippableFromRightOnRightSideViewElement,
                );
            }

            setElementStyles(outsideShadowElement, {
                ...animationStyles.flippableFromRightOnLeftSideViewElement,
                ...animationStyles.outsideShadowElement,
            });

            setElementStyles(outsideShadowWrapperElement, animationStyles.outsideShadowWrapperElementFlippingLeft);
            setElementStyles(bendingShadowElement, {
                ...animationStyles.flippableFromRightOnLeftSideViewElement,
                ...animationStyles.bendingShadowFLippingLeft,
            });

            if (elapsed < animationDurationLeft) {
                requestAnimationFrame(animationCallback);
            } else {

                if(animationDirection === 'FORWARDS') {
                    // We need to remove pages only if the animation was completed, not reset
                    const flippableFromLeftOnLeftSide = this.findFlippableFromLeftOnLeftSideView();
                    if (flippableFromLeftOnLeftSide) {
                        this.views.remove(flippableFromLeftOnLeftSide);
                    }

                    const flippableFromLeftOnRightSide = this.findFlippableFromLeftOnRightSideView();
                    if (flippableFromLeftOnRightSide) {
                        this.views.remove(flippableFromLeftOnRightSide);
                    }

                    const readableLeftPage = this.findReadableLeftPage();
                    if (readableLeftPage) {
                        readableLeftPage.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE);
                    }
                }


                rightVisibleView.setFlippingState(animationDirection === 'FORWARDS' ? VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE : VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT);
                flippableFromRightOnLeftSideView.setFlippingState(animationDirection === 'FORWARDS' ? VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT : VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE );
                if(flippableFromRightOnRightSideView) {
                    flippableFromRightOnRightSideView.setFlippingState(animationDirection === 'FORWARDS' ? VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT : VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE);
                }

                this.resetShadowStyles();

                outsideShadowWrapperElement.classList.remove(this.outsideShadowWrapperFlippingClass);
                outsideShadowElement.classList.remove(this.outsideShadowFlippingLeftClass);
                bendingShadowElement.classList.remove(this.bendingShadowFlippingLeftClass);

                this.isFlipping = false;
            }
        };

        requestAnimationFrame(animationCallback);

        return true;
    }

    /**
     * The outside shadow is the shadow that "borders" the page when it's flipped.
     */
    createOutsideShadow() {
        // Why we need two elements for the drop shadow - https://css-tricks.com/using-box-shadows-and-clip-path-together/
        const outsideShadowWrapper = document.createElement('div');
        outsideShadowWrapper.id = this.outsideShadowWrapperId;
        outsideShadowWrapper.style.position = 'absolute';
        outsideShadowWrapper.style.left = '0';

        const outsideShadow = document.createElement('div');
        outsideShadow.id = this.outsideShadowElementId;

        outsideShadowWrapper.appendChild(outsideShadow);

        this.container.appendChild(outsideShadowWrapper);
    }

    /**
     * The bending shadow is the shine effect on top of the flipping page.
     */
    createBendingShadow() {
        const bendingShadow = document.createElement('div');
        bendingShadow.id = this.bendingShadowElementId;
        bendingShadow.style.position = 'absolute';
        bendingShadow.style.left = '0';

        this.container.appendChild(bendingShadow);
    }

    createAnimationShadows() {
        this.createOutsideShadow();
        this.createBendingShadow();
    }

    render(element, size) {
        super.render(element, size);

        this.createAnimationShadows();
    }

    /**
     * `display` is called at the initial rendering, and when we change location forcefully.
     *  Basically when we call `rendition.display(target)`
     *
     *  And before `display`, the player is cleared so we can do here the initializations.
     */
    display(section, target) {
        const displaying = new defer();
        const displayed = displaying.promise;

        // Check if moving to target is needed
        if (target === section.href || isNumber(target)) {
            target = undefined;
        }

        // Check to make sure the section we want isn't already shown
        const visible = this.views.find(section);

        // View is already shown, just move to correct location in view
        if (visible && section && this.layout.name !== 'pre-paginated') {
            const offset = visible.offset();

            if (this.settings.direction === 'ltr') {
                this.scrollTo(offset.left, offset.top, true);
            } else {
                const width = visible.width();
                this.scrollTo(offset.left + width, offset.top, true);
            }

            if (target) {
                const offset = visible.locationOf(target);
                const width = visible.width();
                this.moveTo(offset, width);
            }

            displaying.resolve();
            return displayed;
        }

        // Hide all current views
        this.clear();

        let forceRight = false;
        if (
            this.layout.name === 'pre-paginated' &&
            this.layout.divisor === 2 &&
            section.properties.includes('page-spread-right')
        ) {
            forceRight = true;
        }

        this.add(section, forceRight)
            .then(
                (view) => {
                    // Move to correct place within the section, if needed
                    if (target) {
                        const offset = view.locationOf(target);
                        const width = view.width();
                        this.moveTo(offset, width);
                    }
                },
                (err) => {
                    displaying.reject(err);
                },
            )
            .then(() => this.handleNextPrePaginated(forceRight, section, this.add))
            .then(() => {
                this.views.show();

                displaying.resolve();
            })
            .then(() => {
                this.renderUnderPages();
                this.generateDynamicCSS();
            });
        // .then(function(){
        // 	return this.hooks.display.trigger(view);
        // }.bind(this))
        // .then(function(){
        // 	this.views.show();
        // }.bind(this));
        return displayed;
    }

    add(section, forceRight) {
        let viewFlippingState = this.isRightToLeft()
            ? VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT
            : VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT;

        /*
             The cover will always be on the right side. Or left, if RTL
         */
        if (section.index === 0) {
            if (this.isRightToLeft()) {
                viewFlippingState = VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT;
            } else {
                viewFlippingState = VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT;
            }
        } else {
            /* The target is always for the left page.
            But if the left page has already been added, we need to add the right page.

            Reverse for RTL
             */
            if (this.views.all().some((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT)) {
                viewFlippingState = VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT;
            }
            if (this.isRightToLeft()) {
                if (this.views.all().some((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT)) {
                    viewFlippingState = VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT;
                }
            }
        }

        const view = this.createView(section, forceRight, viewFlippingState);

        this.views.append(view);

        // view.on(EVENTS.VIEWS.SHOWN, this.afterDisplayed.bind(this));
        view.onDisplayed = this.afterDisplayed.bind(this);
        view.onResize = this.afterResized.bind(this);

        view.on(EVENTS.VIEWS.AXIS, (axis) => {
            this.updateAxis(axis);
        });

        view.on(EVENTS.VIEWS.WRITING_MODE, (mode) => {
            this.updateWritingMode(mode);
        });

        return view.display(this.request);
    }

    append(section, forceRight, viewFlippingState) {
        const view = this.createView(section, forceRight, viewFlippingState);
        this.views.append(view);

        view.onDisplayed = this.afterDisplayed.bind(this);
        view.onResize = this.afterResized.bind(this);

        view.on(EVENTS.VIEWS.AXIS, (axis) => {
            this.updateAxis(axis);
        });

        view.on(EVENTS.VIEWS.WRITING_MODE, (mode) => {
            this.updateWritingMode(mode);
        });

        return view.display(this.request);
    }

    prepend(section, forceRight, viewFlippingState) {
        const view = this.createView(section, forceRight, viewFlippingState);

        view.on(EVENTS.VIEWS.RESIZED, (bounds) => {
            this.counter(bounds);
        });

        this.views.prepend(view);

        view.onDisplayed = this.afterDisplayed.bind(this);
        view.onResize = this.afterResized.bind(this);

        view.on(EVENTS.VIEWS.AXIS, (axis) => {
            this.updateAxis(axis);
        });

        view.on(EVENTS.VIEWS.WRITING_MODE, (mode) => {
            this.updateWritingMode(mode);
        });

        return view.display(this.request);
    }

    setVisibleViewStyles(view, styles) {
        if (!view.element) {
            return;
        }
        setElementStyles(view.element, styles);

        if (!view.isShown()) {
            view.show();
        }
    }

    /**
     * For some reason the shadow element creates a flicker if not completely reset to the initial state.
     *
     */
    resetShadowStyles() {
        const outsideShadowWrapperElement = document.getElementById(this.outsideShadowWrapperId);
        const outsideShadowElement = document.getElementById(this.outsideShadowElementId);

        outsideShadowWrapperElement.style.filter = '';
        outsideShadowElement.style.transform = '';
        outsideShadowElement.style.clipPath = '';
        outsideShadowElement.style.opacity = '';
    }

    getAnimationProgression(elapsedMs, animationDirection) {
        const animationDurationLeft = this.getAnimationDurationLeft(animationDirection);

        const easedPartialProgression = easingFunction(elapsedMs / animationDurationLeft);

        const progression = animationDirection === 'FORWARDS' ? this.dragProgression + easedPartialProgression
                    : this.dragProgression - easedPartialProgression;

        // We don't want the animation to go past the 100%, because the styles get messed up after 100%
        return Math.max(0, Math.min(1, progression));
    }

    getAnimationDurationLeft(animationDirection) {
        return this.animationDurationMs * (animationDirection === 'FORWARDS' ? 1 - this.dragProgression : this.dragProgression);
    }

    flipFromLeftToRight() {
        this.isFlipping = true;

        const leftVisibleView = this.findReadableLeftPage();
        const flippableFromLeftOnRightSideView = this.findFlippableFromLeftOnRightSideView();
        const flippableFromLeftOnLeftSideView = this.findFlippableFromLeftOnLeftSideView();

        if (!leftVisibleView || !flippableFromLeftOnRightSideView) {
            console.log("Previous pages not found, can't flip");
            this.isFlipping = false;
            return false;
        }

        leftVisibleView.setFlippingState(VIEW_FLIPPING_STATE.LEFT_PAGE_FLIPPING_TO_RIGHT);
        flippableFromLeftOnRightSideView.setFlippingState(
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE_FLIPPING_RIGHT,
        );
        if (flippableFromLeftOnLeftSideView) {
            flippableFromLeftOnLeftSideView.setFlippingState(
                VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE_FLIPPING_RIGHT,
            );
        }

        const outsideShadowWrapperElement = document.getElementById(this.outsideShadowWrapperId);
        const outsideShadowElement = document.getElementById(this.outsideShadowElementId);
        const bendingShadowElement = document.getElementById(this.bendingShadowElementId);

        outsideShadowWrapperElement.classList.add(this.outsideShadowWrapperFlippingClass);
        outsideShadowElement.classList.add(this.outsideShadowFlippingRightClass);

        bendingShadowElement.classList.add(this.bendingShadowFlippingRightClass);

        let animationStartTimestamp = null;

        const animationCallback = (timestamp) => {
            if (!animationStartTimestamp) {
                animationStartTimestamp = timestamp;
            }

            const elapsed = timestamp - animationStartTimestamp;

            const progression = this.getAnimationProgression(elapsed);

            const animationStyles = this.getFlippingAnimationStyles(progression);

            this.setVisibleViewStyles(leftVisibleView, animationStyles.leftViewElement);
            this.setVisibleViewStyles(
                flippableFromLeftOnRightSideView,
                animationStyles.flippableFromLeftOnRightSideViewElement,
            );

            if (flippableFromLeftOnLeftSideView) {
                this.setVisibleViewStyles(
                    flippableFromLeftOnLeftSideView,
                    animationStyles.flippableFromLeftOnLeftSideFlippingRight,
                );
            }

            setElementStyles(outsideShadowElement, {
                ...animationStyles.flippableFromLeftOnRightSideViewElement,
                ...animationStyles.outsideShadowElement,
            });

            setElementStyles(outsideShadowWrapperElement, animationStyles.outsideShadowWrapperElementFlippingRight);
            setElementStyles(bendingShadowElement, {
                ...animationStyles.flippableFromLeftOnRightSideViewElement,
                ...animationStyles.bendingShadowFlippingRight,
            });

            if (elapsed < this.animationDurationMs) {
                requestAnimationFrame(animationCallback);
            } else {
                const flippableFromRightOnRightSide = this.findFlippableFromRightOnRightSideView();
                if (flippableFromRightOnRightSide) {
                    this.views.remove(flippableFromRightOnRightSide);
                }

                const flippableFromRightOnLeftSide = this.findFlippableFromRightOnLeftSideView();
                if (flippableFromRightOnLeftSide) {
                    this.views.remove(flippableFromRightOnLeftSide);
                }

                const readableRightPage = this.findRightVisibleView();
                if (readableRightPage) {
                    readableRightPage.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE);
                }

                const readableLeftPageFlipping = this.findLeftPageFlippingRight();
                if (readableLeftPageFlipping) {
                    readableLeftPageFlipping.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE);
                }

                const flippingPageOnRightSide = this.findFlippingFromLeftOnRightSideView();
                if (flippingPageOnRightSide) {
                    flippingPageOnRightSide.setFlippingState(VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT);
                }

                const flippingPageOnLeftSide = this.findFlippingFromLeftOnLeftSideView();
                if (flippingPageOnLeftSide) {
                    flippingPageOnLeftSide.setFlippingState(VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT);
                }

                this.resetShadowStyles();

                outsideShadowWrapperElement.classList.remove(this.outsideShadowWrapperFlippingClass);
                outsideShadowElement.classList.remove(this.outsideShadowFlippingRightClass);
                bendingShadowElement.classList.remove(this.bendingShadowFlippingRightClass);

                this.isFlipping = false;
            }
        };

        requestAnimationFrame(animationCallback);

        return true;
    }

    next() {
        if (!this.views.length) {
            return;
        }
        if (this.isFlipping) {
            console.log('is already flipping');
            return;
        }

        let hasFlipped = false;

        if (this.isRightToLeft()) {
            hasFlipped = this.flipFromLeftToRight();
        } else {
            hasFlipped = this.flipFromRightToLeft();
        }

        /**
         * If the flip has not happened (maybe the next pages were not loaded yet), we don't want to render the under pages.
         */
        if (hasFlipped) {
            // Start rendering next under pages
            this.renderNextUnderPages();
        }
    }

    prev() {
        if (!this.views.length) {
            return;
        }
        if (this.isFlipping) {
            console.log('is already flipping');
            return;
        }

        let hasFlipped = false;

        if (this.isRightToLeft()) {
            hasFlipped = this.flipFromRightToLeft();
        } else {
            hasFlipped = this.flipFromLeftToRight();
        }

        /**
         * If the flip has not happened (maybe the next pages were not loaded yet), we don't want to render the under pages.
         */
        if (hasFlipped) {
            // Start rendering prev under pages
            this.renderPreviousUnderPages();
        }
    }

    findReadableLeftPage() {
        return this.views.all().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT);
    }

    findLeftPageFlippingRight() {
        return this.views.all().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.LEFT_PAGE_FLIPPING_TO_RIGHT);
    }

    findRightVisibleView() {
        return this.views.all().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT);
    }

    findRightVisibleViewFlippingLeft() {
        return this.views.all().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT);
    }

    getCurrentPlusOneFlippableState() {
        if (this.isRightToLeft()) {
            return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE;
        }

        return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE;
    }

    findCurrentPlusOneView() {
        return this.views.all().find((view) => view.viewFlippingState === this.getCurrentPlusOneFlippableState());
    }

    getCurrentPlusTwoFlippableState() {
        if (this.isRightToLeft()) {
            return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE;
        }

        return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE;
    }

    findCurrentPlusTwoView() {
        return this.views.all().find((view) => view.viewFlippingState === this.getCurrentPlusTwoFlippableState());
    }

    findFlippableFromRightOnLeftSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE);
    }

    findFlippableFromRightOnRightSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE);
    }

    findFlippableFromLeftOnLeftSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE);
    }

    findFlippableFromLeftOnRightSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE);
    }

    findFlippingFromRightOnLeftSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT);
    }

    findFlippingFromRightOnRightSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT);
    }

    getCurrentMinusTwoFlippableState() {
        if (this.isRightToLeft()) {
            return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE;
        }

        return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE;
    }

    findCurrentMinusTwoView() {
        return this.views.all().find((view) => view.viewFlippingState === this.getCurrentMinusTwoFlippableState());
    }

    getCurrentMinusOneFlippableState() {
        if (this.isRightToLeft()) {
            return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE;
        }

        return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE;
    }

    findCurrentMinusOneView() {
        return this.views.all().find((view) => view.viewFlippingState === this.getCurrentMinusOneFlippableState());
    }

    findFlippingFromLeftOnRightSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE_FLIPPING_RIGHT);
    }

    findFlippingFromLeftOnLeftSideView() {
        return this.views
            .all()
            .find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE_FLIPPING_RIGHT);
    }

    renderUnderPages() {
        /*
            Most likely the user is going to "next" page, advancing in the book, so we want to render those pages first.
         */
        this.renderNextUnderPages();
        this.renderPreviousUnderPages();
    }

    renderNextUnderPages() {
        const lastView = this.views.last();
        const currentPlusOneSection = lastView && lastView.section.next();
        if (!currentPlusOneSection) {
            return;
        }

        const currentPagePlusTwoSection = currentPlusOneSection.next();

        if (!this.findCurrentPlusOneView()) {
            this.append(currentPlusOneSection, this.isRightToLeft(), this.getCurrentPlusOneFlippableState());
        }
        if (currentPagePlusTwoSection && !this.findCurrentPlusTwoView()) {
            this.append(currentPagePlusTwoSection, true, this.getCurrentPlusTwoFlippableState());
        }
    }

    renderPreviousUnderPages() {
        const firstView = this.views.first();
        const currentPageMinusOneSection = firstView && firstView.section.prev();
        if (!currentPageMinusOneSection) {
            return;
        }

        const currentPageMinusTwoSection = currentPageMinusOneSection.prev();

        if (!this.findCurrentMinusOneView()) {
            this.prepend(currentPageMinusOneSection, true, this.getCurrentMinusOneFlippableState());
        }
        if (currentPageMinusTwoSection && !this.findCurrentMinusTwoView()) {
            this.prepend(currentPageMinusTwoSection, false, this.getCurrentMinusTwoFlippableState());
        }
    }

    getFirstVisibleView() {
        // We want the first view that has content loaded. In this case, it means it has a HTML body element.
        return (
            this.views.all().find((view) => view.isShown()) || this.views.first()
        );
    }

    getPageSize() {
        /*
            ⚠️ We assume that both pages are the same size.

            The actual book page might be smaller. Because the proportions on the book do not always match with half of the player.

            The animations are based on the actual book page size, not the player size.
         */
        const firstView = this.getFirstVisibleView();
        const bodyElement = firstView.getBodyElement();
        if (!bodyElement) {
            console.error('Body element not found');
            return {
                width: 0,
                height: 0,
                diffBetweenIframeWidthAndBodyWidth: 0,
            };
        }

        const bodyRectangle = bodyElement.getBoundingClientRect();
        const diffBetweenIframeWidthAndBodyWidth = firstView.getDiffBetweenIframeAndBodyWidth();

        return {
            width: bodyRectangle.width,
            height: bodyRectangle.height,
            diffBetweenIframeWidthAndBodyWidth,
        };
    }

    /**
     * @param progression
     * @param targetDirection 'LEFT' or 'RIGHT'
     * @param angleRad The rotation angle of the flipped page in radians
     * @returns {string}
     */
    getBendingShadowBackground(progression, targetDirection, angleRad) {
        const bendingShadowRotationRad = targetDirection === 'LEFT' ? (Math.PI - angleRad) / 2 : (Math.PI + angleRad) / 2;

        let shineLocation = Math.min(5 + progression * progression * 100, 100);
        if (targetDirection === 'RIGHT') {
            shineLocation = 100 - shineLocation;
        }

        const shineOffset = 5;

        return `linear-gradient(${bendingShadowRotationRad}rad,
        rgba(255, 255, 255, 0.0) ${Math.min(Math.max(0, shineLocation - 2 * shineOffset), 100)}%,
        rgba(209, 209, 215, 0.8) ${Math.min(Math.max(0, shineLocation - shineOffset), 100)}%,
        rgba(255, 255, 255, 0.8) ${Math.min(Math.max(0, shineLocation), 100)}%,
        rgba(182, 178, 178, 0.8) ${Math.min(Math.max(0, shineLocation + shineOffset), 100)}%,
        rgba(255, 255, 255, 0.0) ${Math.min(Math.max(0, shineLocation + 2 * shineOffset), 100)}%
        )`;
    }

    getFlippingAnimationStyles(progression) {
        const pageSize = this.getPageSize();
        const {width: pageWidth, height, diffBetweenIframeWidthAndBodyWidth} = pageSize;

        const startingAngleRad = Math.PI / 6;
        const progressionBreakPoint = 0.15;

        const xOffset = progression * pageWidth;
        const angleRad =
            progression <= progressionBreakPoint
                ? startingAngleRad
                : ((1 - progression) / (1 - progressionBreakPoint)) * startingAngleRad;

        // yOffset = how much is left after we fold the page on the vertical axis
        const yOffset = height - xOffset * Math.tan((Math.PI - angleRad) / 2);

        const maxShadowWidthStep = 0.5;

        const shadowWidthRatio =
            progression < maxShadowWidthStep
                ? progression / maxShadowWidthStep
                : (1 - progression) / (1 - maxShadowWidthStep);

        const shadowIntensity =
            0.5 +
            0.3 *
            (progression < maxShadowWidthStep
                ? (maxShadowWidthStep - progression) / maxShadowWidthStep
                : (progression - maxShadowWidthStep) / (1 - maxShadowWidthStep));

        return {
            flippableFromLeftOnLeftSideFlippingRight: {
                clipPath: `polygon(${
                    xOffset + diffBetweenIframeWidthAndBodyWidth
                }px ${height}px, ${diffBetweenIframeWidthAndBodyWidth}px ${yOffset}px, ${diffBetweenIframeWidthAndBodyWidth}px 0, ${diffBetweenIframeWidthAndBodyWidth}px ${height}px, ${
                    pageWidth + diffBetweenIframeWidthAndBodyWidth
                }px ${height}px)`,
            },
            /**
             * We use transform: translate3d and rotate3d because 3d transformations do not cause "paint" steps in browser rendering pipelines,
             * making the animations smoother.
             */
            flippableFromLeftOnRightSideViewElement: {
                transformOrigin: `${pageWidth - xOffset}px ${height}px`,
                transform: `translate3d(${
                    -1 * pageWidth + diffBetweenIframeWidthAndBodyWidth + 2 * xOffset
                }px, 0, 0) rotate3d(0, 0, 1, ${-1 * angleRad}rad)`,
                clipPath: `polygon(${pageWidth}px ${yOffset}px, ${pageWidth}px ${yOffset}px, ${pageWidth}px ${yOffset}px, ${
                    pageWidth - xOffset
                }px ${height}px, ${pageWidth}px ${height}px)`,
            },
            leftViewElement: {
                clipPath: `polygon(${diffBetweenIframeWidthAndBodyWidth}px 0, ${
                    pageWidth + diffBetweenIframeWidthAndBodyWidth
                }px 0, ${pageWidth + diffBetweenIframeWidthAndBodyWidth}px ${height}px, ${
                    xOffset + diffBetweenIframeWidthAndBodyWidth
                }px ${height}px, ${diffBetweenIframeWidthAndBodyWidth}px ${yOffset}px)`,
            },
            rightViewElement: {
                clipPath: `polygon(0 0, ${pageWidth}px 0, ${pageWidth}px ${yOffset}px, ${
                    pageWidth - xOffset
                }px ${height}px, 0 ${height}px)`,
            },
            flippableFromRightOnLeftSideViewElement: {
                transformOrigin: `${xOffset + diffBetweenIframeWidthAndBodyWidth}px ${height}px`,
                transform: `translate3d(${2 * pageWidth - 2 * xOffset}px, 0, 0) rotate3d(0, 0, 1, ${angleRad}rad)`,
                clipPath: `polygon(${diffBetweenIframeWidthAndBodyWidth}px ${yOffset}px, ${diffBetweenIframeWidthAndBodyWidth}px ${yOffset}px, ${diffBetweenIframeWidthAndBodyWidth}px ${yOffset}px, ${
                    xOffset + diffBetweenIframeWidthAndBodyWidth
                }px ${height}px, ${diffBetweenIframeWidthAndBodyWidth}px ${height}px)`,
            },
            flippableFromRightOnRightSideViewElement: {
                clipPath: `polygon(${
                    pageWidth - xOffset
                }px ${height}px, ${pageWidth}px ${yOffset}px, ${pageWidth}px 0, ${pageWidth}px ${height}px, 0 ${height}px)`,
            },
            outsideShadowElement: {
                opacity: shadowIntensity,
            },
            outsideShadowWrapperElementFlippingLeft: {
                filter: `drop-shadow(${-1 * 20 * shadowWidthRatio}px ${10 * shadowWidthRatio}px 5px rgba(0, 0, 0, ${
                    0.5 * shadowWidthRatio
                }))`,
            },
            outsideShadowWrapperElementFlippingRight: {
                filter: `drop-shadow(${20 * shadowWidthRatio}px ${10 * shadowWidthRatio}px 5px rgba(0, 0, 0, ${
                    0.5 * shadowWidthRatio
                }))`,
            },
            bendingShadowFLippingLeft: {
                background: this.getBendingShadowBackground(progression, 'LEFT', angleRad),
                opacity: `${1 - progression}`,
            },
            bendingShadowFlippingRight: {
                background: this.getBendingShadowBackground(progression, 'RIGHT', angleRad),
                opacity: `${1 - progression}`,
            },
        };
    }

    generateDynamicCSS() {
        const pageSize = this.getPageSize();
        const {width: pageWidth, height} = pageSize;

        const css = `

		        .${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE},
				.${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE},
				.${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE},
				.${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE},
				#${this.outsideShadowWrapperId}
				 {
					z-index: ${hiddenPagesZIndex};
				}

				.${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE_FLIPPING_RIGHT},
				.${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT} {
				    z-index: ${visibleUnderPagesZIndex};
				 }

				.${VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT},
				.${VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT},
				.${VIEW_FLIPPING_STATE.LEFT_PAGE_FLIPPING_TO_RIGHT},
				.${VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT} {
					z-index: ${visibleReadablePagesZIndex};
				}

				.${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE_FLIPPING_RIGHT},
				.${VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT} {
				    z-index: ${flyingPagesZIndex};
				}

				#${this.outsideShadowWrapperId}.${this.outsideShadowWrapperFlippingClass} {
					z-index: ${outsideShadowWrapperZIndex};
				}

				.${this.outsideShadowFlippingLeftClass},
				.${this.outsideShadowFlippingRightClass} {
					width: ${pageWidth}px;
					height: ${height}px;
					background-color: white;
					opacity: 0;
				}

				.${this.bendingShadowFlippingLeftClass},
				.${this.bendingShadowFlippingRightClass} {
					z-index: ${glowingShadowZIndex};
					width: ${pageWidth}px;
					height: ${height}px;
				}
		`;

        const styleElementId = 'dynamic-flipper-css';
        let styleElement = document.getElementById(styleElementId);
        const isElementAlreadyCreated = !!styleElement;
        if (!isElementAlreadyCreated) {
            styleElement = document.createElement('style');
            styleElement.id = styleElementId;
        }
        styleElement.innerHTML = css;

        if (!isElementAlreadyCreated) {
            document.head.appendChild(styleElement);
        }
    }

    /**
     * Used for calculating location - the manager checks for visible pages to determine location.
     *
     * If the player is currently flipping, we consider the next pages that will be shown - the flipping pages.
     * If the player is not flipping, we consider the "static" two pages.
     *
     * @param view
     * @param offsetPrev
     * @param offsetNext
     * @param _container
     * @returns {boolean}
     */
    isVisible(view, offsetPrev, offsetNext, _container) {
        if (this.isFlipping) {
            /**
             * In theory, only two pages should be considered visible at a time.
             * But since the player can NOT flip both left and right at the same time, it is ok
             * to consider all possible next flipping pages as visible.
             *
             * The pages that WERE visible but now are flipping are not considered, because they will not visible anymore
             * and they should not be counted when checking the current location..
             *
             */
            return [
                VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE_FLIPPING_RIGHT,
                VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE_FLIPPING_RIGHT,
                VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT,
                VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT,
            ].includes(view.viewFlippingState);
        }

        // Player static, not flipping
        return [VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT, VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT].includes(
            view.viewFlippingState,
        );
    }
}

export default FlipperManager;