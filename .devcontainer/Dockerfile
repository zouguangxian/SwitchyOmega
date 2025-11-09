# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/devcontainers/base:1-noble

RUN <<-'EOF' bash
	set -eu -o pipefail
	apt-get update
	apt-get install -y --no-install-recommends ca-certificates shfmt
	rm -rf /var/lib/apt/lists/*
EOF

# Install zsh and oh-my-zsh, and enable plugins
RUN <<-'EOF' bash
	set -eu -o pipefail
	apt-get update
	apt-get install -y --no-install-recommends zsh
	rm -rf /var/lib/apt/lists/*
	[[ ! -d ~/.oh-my-zsh ]] && sh -c "$(curl -L -o- https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
	git clone --depth=1 https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
	git clone --depth=1 https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
	git clone --depth=1 https://github.com/zsh-users/zsh-completions ${ZSH_CUSTOM:=~/.oh-my-zsh/custom}/plugins/zsh-completions
	git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
    cp $HOME/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-lean.zsh $HOME/.p10k.zsh
	sed -i'' -e 's/^plugins.*)/plugins=(z fzf git zsh-autosuggestions zsh-completions)/' \
	-e '/^ZSH_THEME=.*/{
r /dev/stdin
d
}' $HOME/.zshrc <<< $'if [[ "$PAGER" == *"head -n 10000 | cat"* || "$COMPOSER_NO_INTERACTION" == "1" ]]; then\n  ZSH_THEME="robbyrussell"\nelse\n  ZSH_THEME="powerlevel10k/powerlevel10k"\nfi'
	echo '[[ ! -f "$HOME/.p10k.zsh" ]] || source "$HOME/.p10k.zsh"' >> $HOME/.zshrc
	# https://github.com/ohmyzsh/ohmyzsh/issues/7426
	echo 'export LANG=en_US.UTF-8' >> $HOME/.zshrc
EOF

# Install node and moon
RUN <<-'EOF' bash
	set -eu -o pipefail
    bash <(curl -fsSL https://moonrepo.dev/install/proto.sh) --yes --shell=zsh

	~/.proto/bin/proto install moon 1
	~/.proto/bin/proto install node 24
	~/.proto/bin/proto install npm 11
	~/.proto/bin/proto install yarn 4
EOF
