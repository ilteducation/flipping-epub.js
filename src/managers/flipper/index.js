import DefaultViewManager from "../default";
import {defer, extend, isNumber} from "../../utils/core";
import {EVENTS} from "../../utils/constants";
import VIEW_FLIPPING_STATE from "../views/viewflippingstate";


class FlipperManager extends DefaultViewManager {

	constructor(options) {
		super(options);

		this.name = "flipper";
		this.animationDurationMs = 2400;
		this.assumedFPS = 60;
		this.numberOfFrames = this.animationDurationMs / 1000 * this.assumedFPS;
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
		if (section.index === 0) {
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

	next() {
		if (!this.views.length) return;

		let dir = this.settings.direction;

		if (!dir || dir === "ltr") { // Left to right
			const rightVisibleView = this.findRightVisibleView();
			const flippableFromRightOnLeftSideView = this.findFlippableFromRightOnLeftSideView();

			if (!rightVisibleView || !flippableFromRightOnLeftSideView) {
				return;
			}

			rightVisibleView.setFlippingState(VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT);
			flippableFromRightOnLeftSideView.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT);

			const flippableFromRightOnRightSideView = this.findFlippableFromRightOnRightSideView();
			if (flippableFromRightOnRightSideView) {
				flippableFromRightOnRightSideView.setFlippingState(VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT);
			}


		} else { // Right to left
			// tODO

		}

		// Start rendering next under pages
		this.renderNextUnderPages();

		// Changing stuff after the animation
		setTimeout(() => {

            // TODO - report location


		}, this.animationDurationMs);
	}

	findRightVisibleView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT);
	}

	findFlippableFromRightOnLeftSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE);
	}

	findFlippableFromRightOnRightSideView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE);
	}

	renderUnderPages() {
		return Promise.all([
			this.renderNextUnderPages(),
			this.renderPreviousUnderPages()
		]);
	}

	renderNextUnderPages() {
		const lastView = this.views.last();
		const rightPagePlusOne = lastView && lastView.section.next();
		if (!rightPagePlusOne) {
			return Promise.resolve();
		}

		const rightPagePlusTwo = rightPagePlusOne.next();

		return this.q.enqueue(() => {
			if (!this.findFlippableFromRightOnLeftSideView()) {
				return this.append(rightPagePlusOne, false, VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE);
			}
		})
			.then(() => {
				if (rightPagePlusTwo && !this.findFlippableFromRightOnRightSideView()) {
					return this.q.enqueue(() => {
						return this.append(rightPagePlusTwo, true, VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE);
					});
				}
			});
	}

	renderPreviousUnderPages() {
		// TODO
		return Promise.resolve();
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
		let rightTopPageFlippingLeftKeyFrames = "";
		let flippageFromRightOnLeftSideFlippingLeftKeyFrames = "";
		let flippableFromRightOnRightSideFlippingLeftKeyFrames = "";

		for (let frame = 0; frame <= this.numberOfFrames; frame++) {

			const progression = frame / this.numberOfFrames;
			// xOffset = how much we fold the page on the horizontal axis

			const animationStyles = this.getFlippingAnimationStyles(progression);

			rightTopPageFlippingLeftKeyFrames += `
			 ${progression * 100}% {
				clip-path: ${animationStyles.rightViewElement.clipPath};
				}
			`;

			flippageFromRightOnLeftSideFlippingLeftKeyFrames += `
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

		const css = `
						@keyframes right-top-page-flipping-left {
				${rightTopPageFlippingLeftKeyFrames}
			}
			.rightPageFlippingToLeft {
				animation: right-top-page-flipping-left ${this.animationDurationMs / 1000}s forwards;
			}
			
			@keyframes flippable-from-right-on-left-side-flipping-left {
			${flippageFromRightOnLeftSideFlippingLeftKeyFrames}
			}
			.flippableFromRightOnLeftSideFlippingLeft {
				animation: flippable-from-right-on-left-side-flipping-left ${this.animationDurationMs / 1000}s forwards;
			}
			
			@keyframes flippable-from-right-on-right-side-flipping-left {
				${flippableFromRightOnRightSideFlippingLeftKeyFrames}
			}
			
			.flippableFromRightOnRightSideFlippingLeft {
		        animation: flippable-from-right-on-right-side-flipping-left ${this.animationDurationMs / 1000}s forwards;
			}
		`;

		const styleElementId = "dynamic-flipper-css";
		const style = document.getElementById(styleElementId) || document.createElement("style");
		style.id = "dynamic-flipper-css";
		style.innerHTML = css;
		document.head.appendChild(style);

	}


	/*
    TODO - remove this debug method
     */
	setPageFlipAnimationProgress(progression) {

		console.log("setting progression styles", progression);

		const rightVisibleView = this.findRightVisibleView();
		if (!rightVisibleView) {
			return;
		}

		const rightVisibleViewElement = rightVisibleView.element;

		const flippingAnimationStyles = this.getFlippingAnimationStyles(progression);

		rightVisibleViewElement.style.clipPath = flippingAnimationStyles.rightViewElement.clipPath;

		const flippableFromRightOnLeftSideView = this.findFlippableFromRightOnLeftSideView();
		if (flippableFromRightOnLeftSideView) {

			flippableFromRightOnLeftSideView.show();

			const flippableFromRightOnLeftSideViewElement = flippableFromRightOnLeftSideView.element;
			flippableFromRightOnLeftSideViewElement.style.transformOrigin = flippingAnimationStyles.flippableFromRightOnLeftSideViewElement.transformOrigin;
			flippableFromRightOnLeftSideViewElement.style.transform = flippingAnimationStyles.flippableFromRightOnLeftSideViewElement.transform;
			flippableFromRightOnLeftSideViewElement.style.clipPath = flippingAnimationStyles.flippableFromRightOnLeftSideViewElement.clipPath;

		}

	}

}

export default FlipperManager;