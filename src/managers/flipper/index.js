import DefaultViewManager from "../default";


class FlipperManager extends DefaultViewManager {

	constructor(options) {
		super(options);

		this.name = "flipper";
	}

	display(section, target){
		return DefaultViewManager.prototype.display.call(this, section, target)
			.then(() => {
				return this.fillRight();
			});
	}

	next() {
		// TODO - we will need to completely override next() because when flipping pages there is no scrolling


		const superNextResult = super.next();

		if(superNextResult && superNextResult.then) {
			return superNextResult.then(() => {
				return this.fillRight();
			});
		} else {
			return this.fillRight();
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