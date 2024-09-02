import IframeView from "./iframe";
import {EVENTS} from "../../utils/constants";
import VIEW_FLIPPING_STATE from "./viewflippingstate";


class FlippingIframeView extends IframeView {

	constructor(section, options) {
		super(section, options);

		this.viewFlippingState = this.settings.viewFlippingState;

		this.element.classList.add(this.viewFlippingState);
	}

	isOnRightSide() {
		return this.settings.forceRight || this.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT;
	}

	render(request, show) {

		// view.onLayout = this.layout.format.bind(this.layout);
		this.create();

		// Fit to size of the container, apply padding
		this.size();

		if(!this.sectionRender) {
			this.sectionRender = this.section.render(request);
		}

		// Render Chain
		return this.sectionRender
			.then(function(contents){
				return this.load(contents);
			}.bind(this))
			.then(function(){

				// find and report the writingMode axis
				let writingMode = this.contents.writingMode();

				// Set the axis based on the flow and writing mode
				let axis;
				if (this.settings.flow === "scrolled") {
					axis = (writingMode.indexOf("vertical") === 0) ? "horizontal" : "vertical";
				} else {
					axis = (writingMode.indexOf("vertical") === 0) ? "vertical" : "horizontal";
				}

				if (writingMode.indexOf("vertical") === 0 && this.settings.flow === "paginated") {
					this.layout.delta = this.layout.height;
				}

				this.setAxis(axis);
				this.emit(EVENTS.VIEWS.AXIS, axis);

				this.setWritingMode(writingMode);
				this.emit(EVENTS.VIEWS.WRITING_MODE, writingMode);


				// apply the layout function to the contents
				this.layout.format(this.contents, this.section, this.axis);

				// Listen for events that require an expansion of the iframe
				this.addListeners();

				return new Promise((resolve, reject) => {
					// Expand the iframe to the full size of the content
					this.expand();

					if (this.isOnRightSide()) {
						this.element.style.marginLeft = this.width() + "px";
					}
					resolve();
				});

			}.bind(this), function(e){
				this.emit(EVENTS.VIEWS.LOAD_ERROR, e);
				return new Promise((resolve, reject) => {
					reject(e);
				});
			}.bind(this))
			.then(function() {
				this.emit(EVENTS.VIEWS.RENDERED, this.section);
			}.bind(this));
	}

	setFlippingState(newFlippingState) {
		// Removing old class
		this.element.classList.remove(this.viewFlippingState);

		this.viewFlippingState = newFlippingState;

		this.element.classList.add(this.viewFlippingState);
	}

}

export default FlippingIframeView;