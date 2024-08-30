import DefaultViewManager from "../default";


class FlipperManager extends DefaultViewManager {

	constructor(options) {
		super(options);

		this.name = "flipper";
	}

	display(section, target){
		return DefaultViewManager.prototype.display.call(this, section, target)
			.then(() => {
				return this.fill();
			});
	}

	addAnotherPageAfter() {
		const lastView = this.views.last();
		const nextSection = lastView && lastView.section.next();
		const forceRight = false;

		if(nextSection) {
			return this.append(nextSection, forceRight)
				.then(() => {
					return this.handleNextPrePaginated(forceRight, nextSection, this.append);
				})
				.then(() => {
					this.views.show();
				});
		}

		return Promise.resolve();
	}

	fill() {
		console.log("will try to fill the other pages");


		this.q.enqueue(() => {
			return this.addAnotherPageAfter();
		});

		return Promise.resolve();



		// Add one more page after this one

		// const nextSection = this.view.section.next();
		//
		// // TODO - figure out force right
		// const forceRight = false;



		if(nextSection) {


			return this.append(nextSection, forceRight)
				.then(function(){
					return this.handleNextPrePaginated(forceRight, nextSection, this.append);
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


		return Promise.resolve();
	}
}

export default FlipperManager;