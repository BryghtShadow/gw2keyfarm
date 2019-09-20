$(function() {
	// Helper functions
	let divmod=(x,y)=>[(x-x%y)/y,x%y];
	let plural = (n, key) => `${n} ${~-n&&key+'s'||key}`;

	let cacheMode = 'default'
	// cacheMode = 'force-cache'
	let loadJson = (url) => fetch(url, {cache: cacheMode}).then(r=>r.json())

	let tokenName = 'widgetAPIKey';
	let widgetControls = 'WidgetAccountStories-control', widgetRef = '#'+widgetControls;

	let displaySettingsLegend = $(`<fieldset id="${widgetControls}"><legend>Required: API settings</legend></fieldset>`)
	.append($('<div/>').text('Apply an API key here to display story progress for your characters.'))
	.append($('<input/>').addClass('apikey').attr({maxlength: 72, placeholder: "Paste your API key here. (needs account and characters permissions)"}))
	.append($('<button/>').addClass('find-button').attr({title: 'Process API key, store for later visits, and display story progression'}).text('Apply'))
	.append($('<button/>').addClass('forget-button').attr({title: 'Forget currently stored API key'}).text('Forget stored key'))
	.append($('<span/>').html('See <b><a href="https://wiki.guildwars2.com/wiki/API:API_key">API key documentation</a></b> for help.'))

	$('#storycontrol').after(displaySettingsLegend);

	let cookie = JSON.parse(localStorage.getItem(tokenName))
	if (cookie != null) {
		$('.apikey', widgetRef).val(cookie);
	}

	$('.find-button', widgetRef).click(async function() {
		$('.apikey', widgetRef).removeClass('tokenerror');
		// check token
		let token = $('.apikey', widgetRef).val().trim();
		if (token.length != 72) {
			$('.apikey', widgetRef).addClass('tokenerror');
			return;
		}

		let now = +new Date;
		let year = 31536e3;

		// Expects both as Date objects
		let timeDelta = (a, b, c=2) => {
			var r=[],
				s = 0|((b-a)/1e3),
				[i,s] = divmod(s, 60),
				[h,i] = divmod(i, 60),
				[d,h] = divmod(h, 24),
				[y,d] = divmod(d, 365);
			y && r.push(plural(y, 'year'));
			d && r.push(plural(d, 'day'));
			h && r.push(plural(h, 'hour'));
			i && r.push(plural(i, 'minute'));
			s && r.push(plural(s, 'second'));
			return [r.slice(0, c-1).join`, `, r.slice(c-1)[0]].join` and `
		}

		let formatBirthday = (dt) => new Date(dt).toLocaleDateString('ja-JP', {
			year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit',
		});

		let formatAge = (c) => timeDelta(new Date(c), now)

		function formatNextBirthday(c) {
			let b = new Date(c),
				e = (now-b)/1000,
				n = 0|(e/year)+1;
			b.setDate(b.getDate()+365*n)
			return timeDelta(now, b)
		}

		function getBackstoryIcons(backstory) {
			// Maybe use /v2/backstory/questions to get race/profession?
			let personality = 1,
				profession = 2,
				level10 = 3,
				level20 = 4,
				fluff = 5;
			let order = Object.entries({
				[personality]: [7],
				[profession]: [181, 182, 183, 184, 185, 186, 187, 188, 189],
				[level10]: [10, 15, 21, 26, 32],
				[level20]: [11,	17,	22,	27,	31],
				[fluff]: [12, 16, 36, 25, 30],
			}).reduce((a,[k,v])=>(v.map(x=>a[x]=k),a),{});
			let sortByQuestion = (a,b) => order[a.split`-`[0]] - order[b.split`-`[0]];

			let isHuman = backstory.find(x=>x.split`-`[0]==='21')
			let isNorn = backstory.find(x=>x.split`-`[0]==='26')
			return backstory.sort(sortByQuestion)
				.map(id=>{
					if (id === '183-172') {
						if (isNorn) {id += "_(norn)"}
						if (isHuman) {id += "_(human)"}
					}
					return $('<img/>').attr({
						src: `./assets/biography/${id}.png`,
						height: 32,
						width: 32,
					});
				})
		}

		function getQuestsProgress(q) {
			let div = (ch, q, l, s) => {
				s = `${q[l-1]?'':'in'}complete`
				return $('<div/>').addClass(s).text(`${ch} key: ${s}`)
			}
			return [
				div('Ch.1', q.filter(x=>x.level == 10), 5),
				div('Ch.4', q.filter(x=>x.level == 40), 1),
				div('Ch.6', q.filter(x=>x.level == 60), 2),
				div('S2E6', q.filter(x=>x.story == 16), 3),
				div('HoT', q.filter(x=>x.story == 36), 1),
			]
		}

		let urls = [
			('https://api.guildwars2.com/v2/quests?ids=all&lang=en'),
			(`https://api.guildwars2.com/v2/characters?access_token=${token}`),
		]
		Promise.all(urls.map(loadJson)).then(responses=>{
			$('.apikey', widgetRef).addClass('tokenvalid');
			return responses.reduce( (a,r,i) => {
				let k = new URL(urls[i]).pathname.slice(4)
				let v = r
				a[k] = v
				return a
			}, {})
		})
		.then((a)=>{
			a.quests = a.quests.reduce((o,c)=>({...o,[c.id]:c}),{})
			return a
		})
		.then(api=>{
			let getCharData = (name) => {
				return loadJson(`https://api.guildwars2.com/v2/characters/${encodeURIComponent(name)}/core?access_token=${token}&lang=en`)
				.then(core=>
					loadJson(`https://api.guildwars2.com/v2/characters/${encodeURIComponent(name)}/backstory?access_token=${token}&lang=en`)
					.then(backstory=>Object.assign(core, backstory))
				).then(core=>
					loadJson(`https://api.guildwars2.com/v2/characters/${encodeURIComponent(name)}/quests?access_token=${token}&lang=en`)
					.then(quests=>Object.assign(core, {quests: quests.map(id=>api.quests[id])}))
				)
			}


			let updateRow = (name) => {
				return getCharData(name).then(c=>{

					let coreCell = $('<td/>').addClass('core').append([
						$('<div/>').append([
							$('<img/>').attr({src: `./assets/${c.profession}_icon.png`, width:28, height:28}),
							$('<span/>').addClass('name').text(c.name),
						]),
						$('<div/>').addClass(c.profession.toLowerCase()).html([
							$('<span/>').addClass('level').text(`Lvl ${c.level}`),
							$('<span/>').addClass('race').text(c.race),
							$('<span/>').addClass('profession').text(c.profession),
						]),
					]);
					let birthday = formatBirthday(c.created);
					let age = formatAge(c.created);
					let nextBirthday = formatNextBirthday(c.created);

					let birthdayCell = $('<td/>').addClass('birthday').append([
						$('<div/>').addClass('created').text(`Created ${birthday}`),
						$('<div/>').addClass('age').text(`${age} old`),
						$('<div/>').addClass('next-birthday').text(`Next present in ${nextBirthday}`),
					]);

					let backstoryCell = $('<td/>').addClass('backstory').append(
						getBackstoryIcons(c.backstory)
					);

					let questsCell = $('<td/>').addClass('quests').append(
						getQuestsProgress(c.quests)
					);

					let row = $('<tr/>').addClass('character').attr({
						'data-name': c.name,
						'data-created': c.created,
					}).append([
						coreCell,
						backstoryCell,
						questsCell,
						birthdayCell,
					]);
					return row;
				})
			}

			let rows = Promise.allSettled(api.characters.map(updateRow))
			.then(results => {
				let created = (a) => Date.parse($(a).attr('data-created'))
				let sortByCreation = (a,b) => created(b) - created(a)

				return results.map(r => r.status === 'fulfilled' && r.value)
				.filter(x => x)
				.sort(sortByCreation)
			})
			return rows
		}).then(rows=>{
			let wikitable = $('.wikitable');
			let thead = $('<thead/>')
			let thead_row = $('<tr/>').append([
				$('<th/>').text('Core'),
				$('<th/>').text('Backstory'),
				$('<th/>').text('Quests'),
				$('<th/>').text('Birthday'),
			])
			thead.append(thead_row)
			let tbody = $('<tbody/>').append(rows);

			if (wikitable.length == 0) {
				wikitable = $('<table/>').addClass('wikitable sortable')
				$(widgetRef).after(wikitable)
			}
			let old_tbody = $('tbody', wikitable)
			if (old_tbody.length > 0) {
				old_tbody.replaceWith(tbody);
			} else {
				wikitable.append([
					thead,
					tbody,
				]);
			}

			// Store API key for later
			localStorage.setItem(tokenName, JSON.stringify(token));
		})
		
	});

	$('.forget-button', widgetRef).click(function() {
		// Forget API key
		localStorage.removeItem(tokenName);
        $('.apikey', widgetRef).val('');
        $('.apikey', widgetRef).removeClass('tokenerror').removeClass('tokenvalid');
        $('.wikitable', widgetRef).empty();
	});
})