import IframeView from "./iframe";
import {EVENTS} from "../../utils/constants";
import VIEW_FLIPPING_STATE from "./viewflippingstate";


class FlippingIframeView extends IframeView {

    constructor(section, options) {
        super(section, options);

        this.viewFlippingState = this.settings.viewFlippingState;

        this.setFlippingState(this.viewFlippingState);
    }

    isOnRightSide() {
        return this.viewFlippingState === VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT
            || this.viewFlippingState === VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT
            || this.viewFlippingState === VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT;
    }

    render(request, show) {

        // view.onLayout = this.layout.format.bind(this.layout);
        this.create();

        // Fit to size of the container, apply padding
        this.size();

        if (!this.sectionRender) {
            this.sectionRender = this.section.render(request);
        }

        // Render Chain
        return this.sectionRender
            .then(function (contents) {
                return this.load(contents);
            }.bind(this))
            .then(function () {

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

                    this.updateInlineStyle();

                    resolve();
                });

            }.bind(this), function (e) {
                this.emit(EVENTS.VIEWS.LOAD_ERROR, e);
                return new Promise((resolve, reject) => {
                    reject(e);
                });
            }.bind(this))
            .then(function () {
                this.emit(EVENTS.VIEWS.RENDERED, this.section);
            }.bind(this));
    }

    setFlippingState(newFlippingState) {
        // Removing old class
        this.element.classList.remove(this.viewFlippingState);

        this.viewFlippingState = newFlippingState;
        this.element.classList.add(this.viewFlippingState);

        if ([
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE_FLIPPING_RIGHT,
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE_FLIPPING_RIGHT,
            VIEW_FLIPPING_STATE.READABLE_PAGE_LEFT,
            VIEW_FLIPPING_STATE.LEFT_PAGE_FLIPPING_TO_RIGHT,
            VIEW_FLIPPING_STATE.READABLE_PAGE_RIGHT,
            VIEW_FLIPPING_STATE.RIGHT_PAGE_FLIPPING_TO_LEFT,
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE_FLIPPING_LEFT,
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE_FLIPPING_LEFT,
        ].includes(newFlippingState)) {
            this.show();
        }

        if ([
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_LEFT_SIDE,
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_LEFT_ON_RIGHT_SIDE,
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_LEFT_SIDE,
            VIEW_FLIPPING_STATE.FLIPPABLE_FROM_RIGHT_ON_RIGHT_SIDE
        ].includes(newFlippingState)) {
            // Some inconsistent missing check in super.hide()
            if (this.iframe) {
                this.hide();
            }
        }

        this.updateInlineStyle();
    }

    updateInlineStyle() {
        this.element.style.position = "absolute";

        let leftOffset = 0;
        if (this.isOnRightSide()) {
            leftOffset = this.width();
        }
        this.element.style.left = leftOffset + "px";
    }

}

export default FlippingIframeView;