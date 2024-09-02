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
		return new this.View(section, extend(this.viewSettings, { forceRight, viewFlippingState }) );
	}

	display(section, target){

		var displaying = new defer();
		var displayed = displaying.promise;

		// Check if moving to target is needed
		if (target === section.href || isNumber(target)) {
			target = undefined;
		}

		// Check to make sure the section we want isn't already shown
		var visible = this.views.find(section);


		// View is already shown, just move to correct location in view
		if(visible && section && this.layout.name !== "pre-paginated") {
			// TODO -  FIX this for reflowable books
			let offset = visible.offset();

			if (this.settings.direction === "ltr") {
				this.scrollTo(offset.left, offset.top, true);
			} else {
				let width = visible.width();
				this.scrollTo(offset.left + width, offset.top, true);
			}

			if(target) {
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
		/*
		If it is the first page (cover), move it to the right
		 */
		if ((this.layout.name === "pre-paginated" && this.layout.divisor === 2 && section.properties.includes("page-spread-right"))) {
			forceRight = true;
		}

		this.add(section, forceRight)
			.then(function(view){

				// Move to correct place within the section, if needed
				if(target) {
					let offset = view.locationOf(target);
					let width = view.width();
					this.moveTo(offset, width);
				}

			}.bind(this), (err) => {
				displaying.reject(err);
			})
			.then(function(){
				return this.handleNextPrePaginated(forceRight, section, this.add);
			}.bind(this))
			.then(function(){

				this.views.show();

				displaying.resolve();

			}.bind(this));
		// .then(function(){
		// 	return this.hooks.display.trigger(view);
		// }.bind(this))
		// .then(function(){
		// 	this.views.show();
		// }.bind(this));
		return displayed;
	}

	add(section, forceRight){
		let viewFlippingState = VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT;

		/*
		 	The cover will always be on the right side
		 */
		if(section.index === 0) {
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

	append(section, forceRight){
		var view = this.createView(section, forceRight);
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

	next(){
		var next;
		var left;

		let dir = this.settings.direction;

		if(!this.views.length) return;

		if(this.isPaginated && this.settings.axis === "horizontal" && (!dir || dir === "ltr")) {

			this.scrollLeft = this.container.scrollLeft;

			left = this.container.scrollLeft + this.container.offsetWidth + this.layout.delta;

			if(left <= this.container.scrollWidth) {
				this.scrollBy(this.layout.delta, 0, true);
			} else {
				next = this.views.last().section.next();
			}
		} else if (this.isPaginated && this.settings.axis === "horizontal" && dir === "rtl") {

			this.scrollLeft = this.container.scrollLeft;

			if (this.settings.rtlScrollType === "default"){
				left = this.container.scrollLeft;

				if (left > 0) {
					this.scrollBy(this.layout.delta, 0, true);
				} else {
					next = this.views.last().section.next();
				}
			} else {
				left = this.container.scrollLeft + ( this.layout.delta * -1 );

				if (left > this.container.scrollWidth * -1){
					this.scrollBy(this.layout.delta, 0, true);
				} else {
					next = this.views.last().section.next();
				}
			}

		} else if (this.isPaginated && this.settings.axis === "vertical") {

			this.scrollTop = this.container.scrollTop;

			let top  = this.container.scrollTop + this.container.offsetHeight;

			if(top < this.container.scrollHeight) {
				this.scrollBy(0, this.layout.height, true);
			} else {
				next = this.views.last().section.next();
			}

		} else {
			next = this.views.last().section.next();
		}

		if(next) {
			this.clear();
			// The new section may have a different writing-mode from the old section. Thus, we need to update layout.
			this.updateLayout();

			let forceRight = false;
			if (this.layout.name === "pre-paginated" && this.layout.divisor === 2 && next.properties.includes("page-spread-right")) {
				forceRight = true;
			}

			return this.append(next, forceRight)
				.then(function(){
					return this.handleNextPrePaginated(forceRight, next, this.append);
				}.bind(this), (err) => {
					return err;
				})
				.then(function(){

					// Reset position to start for scrolled-doc vertical-rl in default mode
					if (!this.isPaginated &&
						this.settings.axis === "horizontal" &&
						this.settings.direction === "rtl" &&
						this.settings.rtlScrollType === "default") {

						this.scrollTo(this.container.scrollWidth, 0, true);
					}
					this.views.show();
				}.bind(this));
		}
	}


	addAnotherPageAfter() {
		const lastView = this.views.last();
		const nextSection = lastView && lastView.section.next();

		// TODO - figure out force right
		const forceRight = false;

		if(nextSection) {
			return this.append(nextSection, forceRight)
				.then(() => {

					/*
					Apparently, handleNextPrePaginated keeps the sections (pages) in the right group,
					meaning that pages that are supposed to be shown together are shown together.
					 */
					return this.handleNextPrePaginated(forceRight, nextSection, this.append);
				})
				.then(() => {
					this.views.show();
				});
		}

		return Promise.resolve();
	}

	fillRight() {
		console.log("will try to fill the other pages");

		this.q.enqueue(() => {
			return this.addAnotherPageAfter();
		});

		return Promise.resolve();
	}
}

export default FlipperManager;