import DefaultViewManager from "../default";
import {defer, extend, isNumber} from "../../utils/core";
import {EVENTS} from "../../utils/constants";
import VIEW_FLIPPING_STATE from "../views/viewflippingstate";


class FlipperManager extends DefaultViewManager {

	constructor(options) {
		super(options);

		this.name = "flipper";
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
			if (!rightVisibleView) {
				return;
			}

			rightVisibleView.setFlippingState(VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT);

		} else { // Right to left


		}


	}
    
	findRightVisibleView() {
		return this.views.displayed().find((view) => view.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT);
	}

	renderUnderPages() {
		return this.renderNextUnderPages()
			.then(() => {
				return this.renderPreviousUnderPages();
			});

	}

	renderNextUnderPages() {
		const lastView = this.views.last();
		const rightPagePlusOne = lastView && lastView.section.next();
		if (!rightPagePlusOne) {
			return Promise.resolve();
		}

		const rightPagePlusTwo = rightPagePlusOne.next();

		return this.q.enqueue(() => {
			return this.append(rightPagePlusOne, false, VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE);
		})
			.then(() => {
				if (rightPagePlusTwo) {
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

	render(element, size) {
		super.render(element, size);

		this.generateDynamicCSS();
	}

	resize(width, height, epubcfi) {
		super.resize(width, height, epubcfi);

		this.generateDynamicCSS();
	}

	generateDynamicCSS() {
		const pageWidth = this.layout.pageWidth;
		const height = this.layout.height;
		const animationDurationMs = 600;
		const startingAngleRad = Math.PI / 6;
		const progressionBreakPoint = 0.15;
		const assumedFPS = 60;
		const numberOfFrames = animationDurationMs / 1000 * assumedFPS;

		let keyFramesCSS = "";

		for (let frame = 0; frame <= numberOfFrames; frame++) {

			const progression = frame / numberOfFrames;
			// xOffset = how much we fold the page on the horizontal axis
			const xOffset = progression * pageWidth;
			const angleRad = progression <= progressionBreakPoint ? startingAngleRad : ( (1 - progression) / ( 1 - progressionBreakPoint)) * startingAngleRad;

			// yOffset = how much we fold the page on the vertical axis
			const yOffset = height  - xOffset * Math.tan((Math.PI - angleRad) / 2);

			keyFramesCSS += `
			 ${progression * 100}% {
				clip-path: polygon(0 0, 100% 0, 100% ${yOffset}px, calc(100% - ${xOffset}px) 100%, 0 100%);
				}
			`;
		}






		const css = `
						@keyframes right-top-page-flipping-left {
				${keyFramesCSS}
			}
			
			.rightPageFlippingToLeft {
				animation: right-top-page-flipping-left ${animationDurationMs/1000}s forwards;
			}
		`;

		const style = document.createElement("style");
		style.innerHTML = css;
		document.head.appendChild(style);


	}
}

export default FlipperManager;