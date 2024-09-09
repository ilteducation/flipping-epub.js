import DefaultViewManager from "../default";
import {defer, extend, isNumber} from "../../utils/core";
import {EVENTS} from "../../utils/constants";
import VIEW_FLIPPING_STATE from "../views/viewflippingstate";


class FlipperManager extends DefaultViewManager {

	constructor(options) {
		super(options);

		this.name = "flipper";
		this.animationDurationMs = 600;
		this.assumedFPS = 60;
		this.numberOfFrames = this.animationDurationMs / 1000 * this.assumedFPS;

		this.isFlipping = false;
	}

	isRightToLeft() {
		return this.settings.direction === "rtl";
	}

	createView(section, forceRight, viewFlippingState) {
		return new this.View(section, extend(this.viewSettings, {forceRight, viewFlippingState}));
	}

	display(section, target) {
		var displaying = new defer();
		var displayed = displaying.promise;

		// Check if moving to target is needed
		if (target === section.href || isNumber(target)) {
			target = undefined;
		}

		// Check to make sure the section we want isn't already shown
		var visible = this.views.find(section);


		// View is already shown, just move to correct location in view
		if (visible && section && this.layout.name !== "pre-paginated") {
			// TODO -  FIXME this for reflowable books
			let offset = visible.offset();

			if (this.settings.direction === "ltr") {
				this.scrollTo(offset.left, offset.top, true);
			} else {
				let width = visible.width();
				this.scrollTo(offset.left + width, offset.top, true);
			}

			if (target) {
				let offset = visible.locationOf(target);
				let width = visible.width();
				this.moveTo(offset, width);
			}

			displaying.resolve();
			return displayed;
		}

		// Hide all current views
		this.clear();

		let forceRight = false;
		if ((this.layout.name === "pre-paginated" && this.layout.divisor === 2 && section.properties.includes("page-spread-right"))) {
			forceRight = true;
		}

		this.add(section, forceRight)
			.then(function (view) {

				// Move to correct place within the section, if needed
				if (target) {
					let offset = view.locationOf(target);
					let width = view.width();
					this.moveTo(offset, width);
				}

			}.bind(this), (err) => {
				displaying.reject(err);
			})
			.then(function () {
				return this.handleNextPrePaginated(forceRight, section, this.add);
			}.bind(this))
			.then(function () {

				this.views.show();

				displaying.resolve();

			}.bind(this))
			.then(() => {
				return this.renderUnderPages();
			})
			.then(() => {
				return this.generateDynamicCSS();
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
		let viewFlippingState = VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT;

		/*
             The cover will always be on the right side
         */
		if (section.index === 0 && !this.isRightToLeft()) {
			viewFlippingState = VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT;
		}

		var view = this.createView(section, forceRight, viewFlippingState);

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
		var view = this.createView(section, forceRight, viewFlippingState);
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
		var view = this.createView(section, forceRight, viewFlippingState);

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

	currentLocation() {
		return new Promise((resolve, reject) => {
			const checkInterval = setInterval(() => {
				if (!this.isFlipping) {
					clearInterval(checkInterval);
					resolve(super.currentLocation());
				}
			}, 100);
		});
	}

	flipFromRightToLeft() {
		this.isFlipping = true;
		
		const rightVisibleView = this.findRightVisibleView();
		const flippableFromRightOnLeftSideView = this.findFlippableFromRightOnLeftSideView();

		if (!rightVisibleView || !flippableFromRightOnLeftSideView) {
			this.isFlipping = false;
			return;
		}

		rightVisibleView.setFlippingState(VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT);
		flippableFromRightOnLeftSideView.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT);

		const flippableFromRightOnRightSideView = this.findFlippableFromRightOnRightSideView();
		if (flippableFromRightOnRightSideView) {
			flippableFromRightOnRightSideView.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT);
		}

		// Changing stuff after the animation
		setTimeout(() => {
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

			const readableRightPageFlipping = this.findRightVisibleViewFlippingLeft();
			if (readableRightPageFlipping) {
				readableRightPageFlipping.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE);
			}

			const flippingPageOnLeftSide = this.findFlippingFromRightOnLeftSideView();
			if (flippingPageOnLeftSide) {
				flippingPageOnLeftSide.setFlippingState(VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT);
			}

			const flippingPageOnRightSide = this.findFlippingFromRightOnRightSideView();
			if (flippingPageOnRightSide) {
				flippingPageOnRightSide.setFlippingState(VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT);
			}

			this.isFlipping = false;

		}, this.animationDurationMs);
	}

	flipFromLeftToRight() {
		this.isFlipping = true;

		const leftVisibleView = this.findReadableLeftPage();
		const flippableFromLeftOnRightSideView = this.findFlippableFromLeftOnRightSideView();

		if (!leftVisibleView || !flippableFromLeftOnRightSideView) {
			this.isFlipping = false;
			return;
		}

		leftVisibleView.setFlippingState(VIEW_FLIPPING_STATE.LEFT_PAGE_FLIPPING_TO_RIGHT);
		flippableFromLeftOnRightSideView.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE_FLIPPING_RIGHT);

		const flippableFromLeftOnLeftSideView = this.findFlippableFromLeftOnLeftSideView();
		if (flippableFromLeftOnLeftSideView) {
			flippableFromLeftOnLeftSideView.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE_FLIPPING_RIGHT);
		}

		// Changing stuff after the animation
		setTimeout(() => {

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

			this.isFlipping = false;
		}, this.animationDurationMs);

	}

	next() {
		if (!this.views.length) {
			return;
		}
		if (this.isFlipping) {
			console.log("is already flipping");
			return;
		}

		if(this.isRightToLeft()) {
			this.flipFromLeftToRight();
		} else {
			this.flipFromRightToLeft();
		}

		// Start rendering next under pages
		this.renderNextUnderPages();
	}

	prev() {
		if (!this.views.length) {
			return;
		}
		if (this.isFlipping) {
			console.log("is already flipping");
			return;
		}

		if(this.isRightToLeft()) {
			this.flipFromRightToLeft();
		} else {
			this.flipFromLeftToRight();
		}

		// Start rendering prev under pages
		this.renderPreviousUnderPages();
	}

	findReadableLeftPage() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT);
	}

	findLeftPageFlippingRight() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.LEFT_PAGE_FLIPPING_TO_RIGHT);
	}

	findRightVisibleView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT);
	}

	findRightVisibleViewFlippingLeft() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT);
	}

	getCurrentPlusOneFlippableState() {
		if(this.isRightToLeft()) {
			return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE;
		}

		return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE;
	}

	findCurrentPlusOneView() {
		return this.views.displayed().find((view) => view.viewFlippingState === this.getCurrentPlusOneFlippableState());
	}

	getCurrentPlusTwoFlippableState() {
		if(this.isRightToLeft()) {
			return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE;
		}

		return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE;
	}

	findCurrentPlusTwoView() {
		return this.views.displayed().find((view) => view.viewFlippingState === this.getCurrentPlusTwoFlippableState());
	}

	findFlippableFromRightOnLeftSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE);
	}

	findFlippableFromRightOnRightSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE);
	}

	findFlippableFromLeftOnLeftSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE);
	}

	findFlippableFromLeftOnRightSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE);
	}

	findFlippingFromRightOnLeftSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT);
	}

	findFlippingFromRightOnRightSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT);
	}

	getCurrentMinusTwoFlippableState() {
		if(this.isRightToLeft()) {
			return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE;
		}

		return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE;
	}

	findCurrentMinusTwoView() {
		return this.views.displayed().find((view) => view.viewFlippingState === this.getCurrentMinusTwoFlippableState());
	}

	getCurrentMinusOneFlippableState() {
		if(this.isRightToLeft()) {
			return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE;
		}

		return VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE;
	}

	findCurrentMinusOneView() {
		return this.views.displayed().find((view) => view.viewFlippingState === this.getCurrentMinusOneFlippableState());
	}

	findFlippingFromLeftOnRightSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE_FLIPPING_RIGHT);
	}

	findFlippingFromLeftOnLeftSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE_FLIPPING_RIGHT);
	}

	renderUnderPages() {
		/*
			Most likely the user is going to "next" page, advancing in the book, so we want to render those pages first.
		 */

		return Promise.all([
			this.renderNextUnderPages(),
			this.renderPreviousUnderPages()
		]);
	}

	renderNextUnderPages() {
		const lastView = this.views.last();
		const currentPlusOneSection = lastView && lastView.section.next();
		if (!currentPlusOneSection) {
			return Promise.resolve();
		}

		const currentPagePlusTwoSection = currentPlusOneSection.next();

		return this.q.enqueue(() => {
			if (!this.findCurrentPlusOneView()) {
				return this.append(currentPlusOneSection, this.isRightToLeft(), this.getCurrentPlusOneFlippableState());
			}
		})
			.then(() => {
				if (currentPagePlusTwoSection && !this.findCurrentPlusTwoView()) {
					return this.q.enqueue(() => {
						return this.append(currentPagePlusTwoSection, true, this.getCurrentPlusTwoFlippableState());
					});
				}
			});
	}

	renderPreviousUnderPages() {
		const firstView = this.views.first();
		const currentPageMinusOneSection = firstView && firstView.section.prev();
		if (!currentPageMinusOneSection) {
			return Promise.resolve();
		}

		const currentPageMinusTwoSection = currentPageMinusOneSection.prev();

		return this.q.enqueue(() => {
			if (!this.findCurrentMinusOneView()) {
				return this.prepend(currentPageMinusOneSection, true, this.getCurrentMinusOneFlippableState());
			}
		})
			.then(() => {
				if (currentPageMinusTwoSection && !this.findCurrentMinusTwoView()) {
					return this.q.enqueue(() => {
						return this.prepend(currentPageMinusTwoSection, false, this.getCurrentMinusTwoFlippableState());
					});
				}
			});
	}

	resize(width, height, epubcfi) {
		super.resize(width, height, epubcfi);

		this.generateDynamicCSS();
	}

	getPageSize() {
		/*
            The actual book page might be smaller
         */

		const bodyElement = this.views.first().iframe.contentDocument.querySelector("body");

		const bodyRect = bodyElement.getBoundingClientRect();

		return bodyRect;
	}

	getFlippingAnimationStyles(progression) {

		const pageSize = this.getPageSize();
		const {width: pageWidth, height} = pageSize;

		const startingAngleRad = Math.PI / 6;
		const progressionBreakPoint = 0.15;

		const xOffset = progression * pageWidth;
		const angleRad = progression <= progressionBreakPoint ? startingAngleRad : ((1 - progression) / (1 - progressionBreakPoint)) * startingAngleRad;

		// yOffset = how much we fold the page on the vertical axis
		const yOffset = height - xOffset * Math.tan((Math.PI - angleRad) / 2);


		return {
			flippableFromLeftOnLeftSideFlippingRight: {
				clipPath: `polygon(${xOffset}px ${height}px, 0px ${yOffset}px, 0 0, 0 ${height}px, ${pageWidth}px ${height}px)`
			},
			flippableFromLeftOnRightSideViewElement: {
				transformOrigin: `${pageWidth - xOffset}px ${height}px`,
				transform: `translate3d(${-1 * pageWidth + 2 * xOffset}px, 0, 0) rotate3d(0, 0, 1, ${-1 * angleRad}rad)`,
				clipPath: `polygon(${pageWidth}px ${yOffset}px, ${pageWidth}px ${yOffset}px, ${pageWidth}px ${yOffset}px, ${pageWidth - xOffset}px ${height}px, ${pageWidth}px ${height}px)`
			},
			leftViewElement: {
				clipPath: `polygon(0 0, ${pageWidth}px 0, ${pageWidth}px ${height}px, ${xOffset}px ${height}px, 0 ${yOffset}px)`,
			},
			rightViewElement: {
				clipPath: `polygon(0 0, ${pageWidth}px 0, ${pageWidth}px ${yOffset}px, ${pageWidth - xOffset}px ${height}px, 0 ${height}px)`,
			},
			flippableFromRightOnLeftSideViewElement: {
				transformOrigin: `${xOffset}px ${height}px`,
				transform: `translate3d(${2 * pageWidth - 2 * xOffset}px, 0, 0) rotate3d(0, 0, 1, ${angleRad}rad)`,
				clipPath: `polygon(0 ${yOffset}px, 0 ${yOffset}px, 0 ${yOffset}px, ${xOffset}px ${height}px, 0 ${height}px)`
			},
			flippableFromRightOnRightSideViewElement: {
				clipPath: `polygon(${pageWidth - xOffset}px ${height}px, ${pageWidth}px ${yOffset}px, ${pageWidth}px 0, ${pageWidth}px ${height}px, 0 ${height}px)`
			}
		};
	}

	generateDynamicCSS() {
		let flippableFromLeftOnLeftSideFlippingRightKeyframes = "";
		let flippableFromLeftOnRightSideFlippingRightKeyframes = "";
		let leftTopPageFlippingRightKeyFrames = "";
		let rightTopPageFlippingLeftKeyFrames = "";
		let flippableFromRightOnLeftSideFlippingLeftKeyFrames = "";
		let flippableFromRightOnRightSideFlippingLeftKeyFrames = "";

		for (let frame = 0; frame <= this.numberOfFrames; frame++) {

			const progression = frame / this.numberOfFrames;
			// xOffset = how much we fold the page on the horizontal axis

			const animationStyles = this.getFlippingAnimationStyles(progression);

			flippableFromLeftOnLeftSideFlippingRightKeyframes += `
				${progression * 100}% {
					clip-path: ${animationStyles.flippableFromLeftOnLeftSideFlippingRight.clipPath};
				}
			`;

			flippableFromLeftOnRightSideFlippingRightKeyframes += `
                ${progression * 100}% {
                    transform-origin: ${animationStyles.flippableFromLeftOnRightSideViewElement.transformOrigin};
                    transform: ${animationStyles.flippableFromLeftOnRightSideViewElement.transform};
                    clip-path: ${animationStyles.flippableFromLeftOnRightSideViewElement.clipPath};
                }
            `;

			rightTopPageFlippingLeftKeyFrames += `
			 ${progression * 100}% {
				clip-path: ${animationStyles.rightViewElement.clipPath};
				}
			`;
			leftTopPageFlippingRightKeyFrames += `
			 ${progression * 100}% {
			 				clip-path: ${animationStyles.leftViewElement.clipPath};
			 }
			 `;

			flippableFromRightOnLeftSideFlippingLeftKeyFrames += `
			 ${progression * 100}% {
			 	transform-origin: ${animationStyles.flippableFromRightOnLeftSideViewElement.transformOrigin};
			 	transform: ${animationStyles.flippableFromRightOnLeftSideViewElement.transform};
			 	clip-path: ${animationStyles.flippableFromRightOnLeftSideViewElement.clipPath};
			}
			`;

			flippableFromRightOnRightSideFlippingLeftKeyFrames += `
			 ${progression * 100}% {
			 	clip-path: ${animationStyles.flippableFromRightOnRightSideViewElement.clipPath};
			 }
			 `;
		}

		/**
		 * Bezier points for animation timing function
		 */
		const p1 = { x: 0.57, y: 0.14 };
		const p2 = { x: 0.71, y: 0.29 };

		const css = `
		
			@keyframes flippable-from-left-on-left-side-flipping-right {
				${flippableFromLeftOnLeftSideFlippingRightKeyframes}
			}
		
			.flippableFromLeftOnLeftSideFlippingRight {
				animation: flippable-from-left-on-left-side-flipping-right ${this.animationDurationMs / 1000}s forwards;
				animation-timing-function: cubic-bezier(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y});
			}
        
            @keyframes flippable-from-left-on-right-side-flipping-right {
                ${flippableFromLeftOnRightSideFlippingRightKeyframes}
            }
        
            .flippableFromLeftOnRightSideFlippingRight {
                z-index: 1;
                animation: flippable-from-left-on-right-side-flipping-right ${this.animationDurationMs / 1000}s forwards;
				animation-timing-function: cubic-bezier(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y});
                
            }
        
            @keyframes left-top-page-flipping-right {
				${leftTopPageFlippingRightKeyFrames}
			}
			
			.leftPageFlippingToRight{
				animation: left-top-page-flipping-right ${this.animationDurationMs / 1000}s forwards;
				animation-timing-function: cubic-bezier(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y});
			}
			
			@keyframes right-top-page-flipping-left {
				${rightTopPageFlippingLeftKeyFrames}
			}
			.rightPageFlippingToLeft {
				animation: right-top-page-flipping-left ${this.animationDurationMs / 1000}s forwards;
				animation-timing-function: cubic-bezier(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y});
			}
			
			@keyframes flippable-from-right-on-left-side-flipping-left {
				${flippableFromRightOnLeftSideFlippingLeftKeyFrames}
			}
			.flippableFromRightOnLeftSideFlippingLeft {
				z-index: 1;
				animation: flippable-from-right-on-left-side-flipping-left ${this.animationDurationMs / 1000}s forwards;
				animation-timing-function: cubic-bezier(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y});
			}
			
			@keyframes flippable-from-right-on-right-side-flipping-left {
				${flippableFromRightOnRightSideFlippingLeftKeyFrames}
			}
			
			.flippableFromRightOnRightSideFlippingLeft {
		        animation: flippable-from-right-on-right-side-flipping-left ${this.animationDurationMs / 1000}s forwards;
				animation-timing-function: cubic-bezier(${p1.x}, ${p1.y}, ${p2.x}, ${p2.y});
			}
		`;

		const styleElementId = "dynamic-flipper-css";
		let styleElement = document.getElementById(styleElementId);
		const isElementAlreadyCreated = !!styleElement;
		if (!isElementAlreadyCreated) {
			styleElement = document.createElement("style");
			styleElement.id = "dynamic-flipper-css";
		}
		styleElement.innerHTML = css;

		if (!isElementAlreadyCreated) {
			document.head.appendChild(styleElement);
		}
	}


	/**
     * Used for calculating location
     *
     * @param view
     * @param offsetPrev
     * @param offsetNext
     * @param _container
     * @returns {boolean}
     */
	isVisible(view, offsetPrev, offsetNext, _container) {
		if (![VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT, VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT].includes(view.viewFlippingState)) {
			return false;
		}

		return super.isVisible(view, offsetPrev, offsetNext, _container);
	}

	/*
    TODO - remove this debug method
     */
	setPageFlipAnimationProgress(progression) {

		console.log("setting progression styles", progression);

		const flippingAnimationStyles = this.getFlippingAnimationStyles(progression);

		const rightVisibleView = this.findRightVisibleView();
		if (!rightVisibleView) {
			return;
		}

		const rightVisibleViewElement = rightVisibleView.element;

		rightVisibleViewElement.style.clipPath = flippingAnimationStyles.rightViewElement.clipPath;

		const flippableFromRightOnLeftSideView = this.findFlippableFromRightOnLeftSideView();
		if (flippableFromRightOnLeftSideView) {

			flippableFromRightOnLeftSideView.show();

			const flippableFromRightOnLeftSideViewElement = flippableFromRightOnLeftSideView.element;
			flippableFromRightOnLeftSideViewElement.style.transformOrigin = flippingAnimationStyles.flippableFromRightOnLeftSideViewElement.transformOrigin;
			flippableFromRightOnLeftSideViewElement.style.transform = flippingAnimationStyles.flippableFromRightOnLeftSideViewElement.transform;
			flippableFromRightOnLeftSideViewElement.style.clipPath = flippingAnimationStyles.flippableFromRightOnLeftSideViewElement.clipPath;

		}

		const pageSize = this.getPageSize();
		const {width: pageWidth, height} = pageSize;


		const flippableFRomRightOnRightSideView = this.findFlippableFromRightOnRightSideView();
		if (flippableFRomRightOnRightSideView) {
			flippableFRomRightOnRightSideView.show();

			const flippableFromRightOnRightSideViewElement = flippableFRomRightOnRightSideView.element;
			flippableFromRightOnRightSideViewElement.style.clipPath = flippingAnimationStyles.flippableFromRightOnRightSideViewElement.clipPath;
			flippableFromRightOnRightSideViewElement.style.left = `${pageWidth}px`;
		}


	}

}

export default FlipperManager;